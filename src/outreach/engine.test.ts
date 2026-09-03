import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockAIProvider } from "./ai.ts";
import { MockEmailProvider } from "./email.ts";
import {
  approveLead,
  executeApproved,
  executeLead,
  executionEligibility,
  holdLead,
  rejectLead,
  runCognitivePipeline,
  setRecipient,
  simulateBounce,
  simulateReply,
  simulateUnsubscribe,
  successfulSendsToday,
} from "./engine.ts";
import { createSequentialIds, type AppState, type Clock, type Lead } from "./models.ts";
import { createInitialState } from "./seed.ts";

function clockAt(isoStamp: string): Clock {
  return { now: () => new Date(isoStamp) };
}

function harness(options?: { dailyLimit?: number; at?: string }) {
  const clock = clockAt(options?.at ?? "2026-09-02T15:00:00.000Z");
  const email = new MockEmailProvider();
  const deps = {
    clock,
    ids: createSequentialIds(),
    ai: new MockAIProvider(),
    email,
    dailyLimit: options?.dailyLimit ?? 5,
  };
  const state = createInitialState(clock);
  return { deps, email, state, clock };
}

function leadById(state: AppState, id: string): Lead {
  const lead = state.leads.find((item) => item.id === id);
  assert.ok(lead, `missing ${id}`);
  return lead;
}

function pipeline(state: AppState, deps: ReturnType<typeof harness>["deps"]) {
  return runCognitivePipeline(state, deps).state;
}

function prepareApproved(
  state: AppState,
  deps: ReturnType<typeof harness>["deps"],
  id: string,
  email: string,
) {
  let next = pipeline(state, deps);
  next = setRecipient(next, id, email, deps.clock).state;
  const approved = approveLead(next, id, deps);
  assert.equal(approved.ok, true, approved.message);
  return approved.state;
}

describe("qualification and cognitive pipeline", () => {
  it("scores leads transparently and does not send", () => {
    const { deps, email, state } = harness();
    const result = runCognitivePipeline(state, deps);
    assert.equal(email.calls.length, 0);
    const northline = leadById(result.state, "lead_northline");
    assert.equal(northline.status, "DraftGenerated");
    assert.ok((northline.score ?? 0) >= 60, `expected high score, got ${northline.score}`);
    assert.match(northline.score_reason ?? "", /Automation \/ integration pain/);
    assert.match(northline.score_reason ?? "", /Total \d+\/100/);
    assert.ok(northline.diagnosis);
    assert.ok(northline.generated_message);
    const hobby = leadById(result.state, "lead_willowbrook");
    assert.ok((hobby.score ?? 100) < (northline.score ?? 0));
  });
});

describe("human review", () => {
  it("3. missing recipient blocks approval", () => {
    const { deps, state } = harness();
    const drafted = pipeline(state, deps);
    const result = approveLead(drafted, "lead_northline", deps);
    assert.equal(result.ok, false);
    assert.equal(leadById(result.state, "lead_northline").status, "DraftGenerated");
    assert.match(result.message, /recipient/i);
  });

  it("2. approval itself does not send", () => {
    const { deps, email, state } = harness();
    const next = prepareApproved(state, deps, "lead_northline", "ops@northline.example.com");
    const lead = leadById(next, "lead_northline");
    assert.equal(lead.status, "Approved");
    assert.equal(lead.send_count, 0);
    assert.equal(email.calls.length, 0);
    assert.ok(next.events.some((event) => event.type === "approved"));
    assert.equal(next.events.some((event) => event.type === "send_succeeded"), false);
  });
});

describe("execution eligibility", () => {
  it("1. unapproved leads cannot send", () => {
    const { deps, email, state } = harness();
    const drafted = pipeline(state, deps);
    const result = executeLead(drafted, "lead_northline", deps);
    assert.equal(result.ok, false);
    assert.equal(email.calls.length, 0);
    assert.equal(leadById(result.state, "lead_northline").status, "DraftGenerated");
    assert.ok(result.state.events.some((event) => event.type === "send_attempted" && event.outcome === "blocked"));
  });

  it("4. rejected leads cannot send", () => {
    const { deps, email, state } = harness();
    let next = pipeline(state, deps);
    next = setRecipient(next, "lead_hale", "intake@hale.example.com", deps.clock).state;
    next = rejectLead(next, "lead_hale", deps).state;
    assert.equal(leadById(next, "lead_hale").status, "Rejected");
    const result = executeLead(next, "lead_hale", deps);
    assert.equal(result.ok, false);
    assert.equal(email.calls.length, 0);
    assert.equal(leadById(result.state, "lead_hale").status, "Rejected");
  });

  it("5. held leads cannot send", () => {
    const { deps, email, state } = harness();
    let next = pipeline(state, deps);
    next = setRecipient(next, "lead_packetlane", "ops@packetlane.example.com", deps.clock).state;
    next = holdLead(next, "lead_packetlane", deps).state;
    assert.equal(leadById(next, "lead_packetlane").status, "Held");
    const result = executeLead(next, "lead_packetlane", deps);
    assert.equal(result.ok, false);
    assert.equal(email.calls.length, 0);
    assert.equal(leadById(result.state, "lead_packetlane").status, "Held");
  });
});

describe("delivery outcomes", () => {
  it("rejects an approved lead with no generated draft before provider execution", () => {
    const { deps, email, state, clock } = harness();
    const approved = prepareApproved(state, deps, "lead_northline", "ops@northline.example.com");
    const tampered: AppState = {
      ...approved,
      leads: approved.leads.map((lead) =>
        lead.id === "lead_northline" ? { ...lead, generated_message: null } : lead,
      ),
    };

    const result = executeLead(tampered, "lead_northline", deps);

    assert.equal(result.ok, false);
    assert.match(result.message, /No generated outreach draft is available/);
    assert.equal(email.calls.length, 0);
    assert.equal(leadById(result.state, "lead_northline").status, "Approved");
    assert.equal(leadById(result.state, "lead_northline").send_count, 0);
    assert.equal(successfulSendsToday(result.state, clock), 0);
  });

  it("rejects an approved lead with a whitespace-only draft before provider execution", () => {
    const { deps, email, state, clock } = harness();
    const approved = prepareApproved(state, deps, "lead_hale", "intake@hale.example.com");
    const tampered: AppState = {
      ...approved,
      leads: approved.leads.map((lead) =>
        lead.id === "lead_hale" ? { ...lead, generated_message: " \n\t " } : lead,
      ),
    };

    const result = executeLead(tampered, "lead_hale", deps);

    assert.equal(result.ok, false);
    assert.match(result.message, /No generated outreach draft is available/);
    assert.equal(email.calls.length, 0);
    assert.equal(leadById(result.state, "lead_hale").status, "Approved");
    assert.equal(leadById(result.state, "lead_hale").send_count, 0);
    assert.equal(successfulSendsToday(result.state, clock), 0);
  });

  it("7. successful delivery increments send count and moves to Sent", () => {
    const { deps, email, state } = harness();
    const approved = prepareApproved(state, deps, "lead_oakridge", "quotes@oakridge.example.com");
    const result = executeLead(approved, "lead_oakridge", deps);
    assert.equal(result.ok, true);
    const lead = leadById(result.state, "lead_oakridge");
    assert.equal(lead.status, "Sent");
    assert.equal(lead.send_count, 1);
    assert.equal(email.calls.length, 1);
    assert.equal(successfulSendsToday(result.state, deps.clock), 1);
  });

  it("6. failed delivery does not transition to Sent", () => {
    const { deps, email, state } = harness();
    const approved = prepareApproved(state, deps, "lead_northline", "ops+fail@northline.example.com");
    const result = executeLead(approved, "lead_northline", deps);
    assert.equal(result.ok, false);
    const lead = leadById(result.state, "lead_northline");
    assert.equal(lead.status, "Failed");
    assert.equal(lead.send_count, 0);
    assert.equal(email.calls.length, 1);
    assert.equal(successfulSendsToday(result.state, deps.clock), 0);
    assert.ok(result.state.events.some((event) => event.type === "send_failed"));
  });

  it("8. successfully sent lead cannot send twice (execution layer)", () => {
    const { deps, email, state } = harness();
    const approved = prepareApproved(state, deps, "lead_meridian", "desk@meridian.example.com");
    const sent = executeLead(approved, "lead_meridian", deps);
    assert.equal(leadById(sent.state, "lead_meridian").status, "Sent");
    const again = executeLead(sent.state, "lead_meridian", deps);
    assert.equal(again.ok, false);
    assert.equal(email.calls.length, 1);
    assert.equal(leadById(again.state, "lead_meridian").send_count, 1);

    const tampered: AppState = {
      ...sent.state,
      leads: sent.state.leads.map((item) =>
        item.id === "lead_meridian" ? { ...item, status: "Approved" as const, send_count: 1 } : item,
      ),
    };
    const forced = executeLead(tampered, "lead_meridian", deps);
    assert.equal(forced.ok, false);
    assert.match(forced.message, /Duplicate protection/);
    assert.equal(email.calls.length, 1);
  });
});

describe("suppression and inbound events", () => {
  it("10. bounce suppresses recipient", () => {
    const { deps, state } = harness();
    const approved = prepareApproved(state, deps, "lead_hale", "intake@hale.example.com");
    const sent = executeLead(approved, "lead_hale", deps);
    const bounced = simulateBounce(sent.state, "lead_hale", deps);
    assert.equal(bounced.ok, true);
    const lead = leadById(bounced.state, "lead_hale");
    assert.equal(lead.suppressed, true);
    assert.equal(lead.status, "Sent");
    assert.ok(bounced.state.suppressedEmails.includes("intake@hale.example.com"));
  });

  it("11. unsubscribe suppresses recipient", () => {
    const { deps, state } = harness();
    const approved = prepareApproved(state, deps, "lead_oakridge", "quotes@oakridge.example.com");
    const sent = executeLead(approved, "lead_oakridge", deps);
    const result = simulateUnsubscribe(sent.state, "lead_oakridge", deps);
    assert.equal(result.ok, true);
    assert.equal(leadById(result.state, "lead_oakridge").suppressed, true);
    assert.ok(result.state.events.some((event) => event.type === "unsubscribed"));
  });

  it("9. suppressed recipient cannot send", () => {
    const { deps, email, state } = harness();
    let next = pipeline(state, deps);
    next = setRecipient(next, "lead_northline", "shared@example.com", deps.clock).state;
    next = setRecipient(next, "lead_hale", "shared@example.com", deps.clock).state;
    next = approveLead(next, "lead_northline", deps).state;
    next = approveLead(next, "lead_hale", deps).state;
    next = executeLead(next, "lead_northline", deps).state;
    next = simulateUnsubscribe(next, "lead_northline", deps).state;
    assert.equal(leadById(next, "lead_hale").status, "Approved");
    const blocked = executeLead(next, "lead_hale", deps);
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /suppress/i);
    assert.equal(leadById(blocked.state, "lead_hale").status, "Approved");
    assert.equal(leadById(blocked.state, "lead_hale").send_count, 0);
    assert.equal(email.calls.length, 1);
  });

  it("12. reply updates lifecycle state", () => {
    const { deps, state } = harness();
    const approved = prepareApproved(state, deps, "lead_packetlane", "ops@packetlane.example.com");
    const sent = executeLead(approved, "lead_packetlane", deps);
    const replied = simulateReply(sent.state, "lead_packetlane", deps);
    assert.equal(replied.ok, true);
    assert.equal(leadById(replied.state, "lead_packetlane").status, "Replied");
  });
});

describe("daily limit", () => {
  it("13. daily limit prevents additional execution", () => {
    const { deps, email, state } = harness({ dailyLimit: 1 });
    let next = pipeline(state, deps);
    next = setRecipient(next, "lead_northline", "a@example.com", deps.clock).state;
    next = setRecipient(next, "lead_hale", "b@example.com", deps.clock).state;
    next = approveLead(next, "lead_northline", deps).state;
    next = approveLead(next, "lead_hale", deps).state;
    const batch = executeApproved(next, deps);
    assert.equal(leadById(batch.state, "lead_northline").status, "Sent");
    assert.equal(leadById(batch.state, "lead_hale").status, "Approved");
    assert.equal(email.calls.length, 1);
    assert.equal(successfulSendsToday(batch.state, deps.clock), 1);
  });

  it("14. failed attempts do not consume successful-send quota", () => {
    const { deps, email, state } = harness({ dailyLimit: 1 });
    let next = pipeline(state, deps);
    next = setRecipient(next, "lead_northline", "ops+fail@example.com", deps.clock).state;
    next = setRecipient(next, "lead_hale", "intake@hale.example.com", deps.clock).state;
    next = approveLead(next, "lead_northline", deps).state;
    next = approveLead(next, "lead_hale", deps).state;
    next = executeLead(next, "lead_northline", deps).state;
    assert.equal(leadById(next, "lead_northline").status, "Failed");
    assert.equal(successfulSendsToday(next, deps.clock), 0);
    const second = executeLead(next, "lead_hale", deps);
    assert.equal(second.ok, true);
    assert.equal(leadById(second.state, "lead_hale").status, "Sent");
    assert.equal(email.calls.length, 2);
    assert.equal(successfulSendsToday(second.state, deps.clock), 1);
  });
});

describe("executionEligibility is independent of the UI", () => {
  it("rejects an Approved-looking lead that is suppressed", () => {
    const { deps, state } = harness();
    const approved = prepareApproved(state, deps, "lead_willowbrook", "hello@willowbrook.example.com");
    const tampered: Lead = { ...leadById(approved, "lead_willowbrook"), suppressed: true };
    const gate = executionEligibility(approved, tampered, deps.clock, 5);
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.match(gate.reason, /suppressed/i);
  });
});
