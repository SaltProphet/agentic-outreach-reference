/**
 * Application service — the only path that mutates lead lifecycle.
 *
 * Control boundaries enforced here, not in the UI:
 *
 * 1. AI never calls this module's execution path.
 * 2. Approval is a state change. It does not send.
 * 3. Execution is a separate operation and re-checks eligibility.
 * 4. The delivery provider is invoked only after those checks pass.
 * 5. Only a provider result of "sent" increments send_count and moves to Sent.
 * 6. Duplicate sends, suppression, and the daily quota are enforced here
 *    even if a caller ignores the dashboard.
 */

import type { AIProvider } from "./ai.ts";
import type { DeliveryResult, EmailProvider } from "./email.ts";
import { isExecutableStatus, REVIEWABLE, transition } from "./lifecycle.ts";
import {
  DAILY_SEND_LIMIT,
  isValidEmail,
  iso,
  normalizeEmail,
  utcDay,
  type AppState,
  type Clock,
  type IdFactory,
  type Lead,
  type SystemEvent,
} from "./models.ts";
import { qualifyLead } from "./qualification.ts";
import { createInitialState } from "./seed.ts";

export interface EngineDeps {
  clock: Clock;
  ids: IdFactory;
  ai: AIProvider;
  email: EmailProvider;
  dailyLimit?: number;
}

export interface ActionResult {
  ok: boolean;
  state: AppState;
  message: string;
}

function appendEvent(
  state: AppState,
  ids: IdFactory,
  clock: Clock,
  partial: Omit<SystemEvent, "id" | "at">,
): AppState {
  const event: SystemEvent = {
    id: ids.next("evt"),
    at: iso(clock),
    ...partial,
  };
  return { ...state, events: [event, ...state.events] };
}

function updateLead(state: AppState, id: string, fn: (lead: Lead) => Lead): AppState {
  return {
    ...state,
    leads: state.leads.map((lead) => (lead.id === id ? fn(lead) : lead)),
  };
}

function requireLead(state: AppState, id: string): Lead {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) throw new Error(`Unknown lead: ${id}`);
  return lead;
}

export function successfulSendsToday(state: AppState, clock: Clock): number {
  const day = utcDay(clock);
  return state.successfulSendAt.filter((stamp) => stamp.slice(0, 10) === day).length;
}

export function isEmailSuppressed(state: AppState, email: string | null): boolean {
  if (!email) return false;
  return state.suppressedEmails.includes(normalizeEmail(email));
}

export type BlockReason =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Execution eligibility. Evaluated in the execution service, not the UI.
 */
export function executionEligibility(
  state: AppState,
  lead: Lead,
  clock: Clock,
  dailyLimit: number,
): BlockReason {
  if (!isExecutableStatus(lead.status)) {
    return { ok: false, reason: `Lead status is ${lead.status}, not Approved.` };
  }
  if (!isValidEmail(lead.recipient_email)) {
    return { ok: false, reason: "Recipient email is missing or invalid." };
  }
  if (lead.send_count !== 0) {
    return { ok: false, reason: "Duplicate protection: send_count is not 0." };
  }
  if (lead.suppressed) {
    return { ok: false, reason: "Lead is marked suppressed." };
  }
  if (isEmailSuppressed(state, lead.recipient_email)) {
    return { ok: false, reason: "Recipient address is on the suppression list." };
  }
  if (successfulSendsToday(state, clock) >= dailyLimit) {
    return { ok: false, reason: `Daily demo send limit of ${dailyLimit} has been reached.` };
  }
  return { ok: true };
}

export function resetDemo(deps: Pick<EngineDeps, "clock">): AppState {
  return createInitialState(deps.clock);
}

/**
 * Discovered → Qualified → Analyzed → DraftGenerated
 * for every lead that is still in that pipeline.
 * Qualification is deterministic. Analysis and draft come from the AI provider
 * and are stored as content only.
 */
export function runCognitivePipeline(state: AppState, deps: EngineDeps): ActionResult {
  const at = iso(deps.clock);
  let next = state;
  let qualified = 0;
  let analyzed = 0;
  let drafted = 0;

  for (const lead of state.leads) {
    if (lead.status !== "Discovered") continue;
    const { score, score_reason } = qualifyLead(lead);
    next = updateLead(next, lead.id, (current) =>
      transition({ ...current, score, score_reason }, "Qualified", at),
    );
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "qualified",
      lead_id: lead.id,
      outcome: "ok",
      reason: `Score ${score}/100. ${score_reason}`,
    });
    qualified += 1;
  }

  for (const lead of next.leads) {
    if (lead.status !== "Qualified") continue;
    const diagnosis = deps.ai.diagnose(lead);
    const text = `${diagnosis.summary} Bottleneck: ${diagnosis.bottleneck}`;
    next = updateLead(next, lead.id, (current) =>
      transition({ ...current, diagnosis: text }, "Analyzed", at),
    );
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "analyzed",
      lead_id: lead.id,
      outcome: "ok",
      reason: `Provider ${deps.ai.name}. ${diagnosis.bottleneck}`,
    });
    analyzed += 1;
  }

  for (const lead of next.leads) {
    if (lead.status !== "Analyzed") continue;
    const message = deps.ai.draft(lead);
    next = updateLead(next, lead.id, (current) =>
      transition({ ...current, generated_message: message }, "DraftGenerated", at),
    );
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "draft_generated",
      lead_id: lead.id,
      outcome: "ok",
      reason: `Provider ${deps.ai.name} produced an outreach draft. Drafts have no send authority.`,
    });
    drafted += 1;
  }

  if (qualified + analyzed + drafted === 0) {
    return {
      ok: true,
      state: next,
      message: "No leads were in Discovered, Qualified, or Analyzed. Nothing to run.",
    };
  }

  return {
    ok: true,
    state: next,
    message: `Pipeline ran: ${qualified} qualified, ${analyzed} analyzed, ${drafted} drafts generated. Nothing was sent.`,
  };
}

export function setRecipient(state: AppState, leadId: string, email: string, clock: Clock): ActionResult {
  const trimmed = email.trim();
  const lead = requireLead(state, leadId);
  if (lead.status === "Sent" || lead.status === "Replied") {
    return { ok: false, state, message: "Recipient cannot be changed after a successful send." };
  }
  const next = updateLead(state, leadId, (current) => ({
    ...current,
    recipient_email: trimmed.length === 0 ? null : trimmed,
    updated_at: iso(clock),
  }));
  return { ok: true, state: next, message: trimmed ? `Recipient set to ${trimmed}.` : "Recipient cleared." };
}

export function approveLead(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (!REVIEWABLE.has(lead.status) && lead.status !== "Approved") {
    return { ok: false, state, message: `Cannot approve a lead in status ${lead.status}.` };
  }
  if (lead.status === "Approved") {
    return { ok: true, state, message: "Lead is already approved. Approval does not send outreach." };
  }
  if (!isValidEmail(lead.recipient_email)) {
    return { ok: false, state, message: "Approval requires a valid recipient email." };
  }
  if (lead.suppressed || isEmailSuppressed(state, lead.recipient_email)) {
    return { ok: false, state, message: "Cannot approve a suppressed recipient." };
  }

  const at = iso(deps.clock);
  let next = updateLead(state, leadId, (current) => transition(current, "Approved", at));
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "approved",
    lead_id: leadId,
    outcome: "ok",
    reason: `Approved for ${lead.recipient_email}. Approval is not execution; nothing was sent.`,
  });
  return {
    ok: true,
    state: next,
    message: `Approved ${lead.company}. Outreach was not sent. Use Execute Approved to run the delivery adapter.`,
  };
}

export function rejectLead(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (!REVIEWABLE.has(lead.status)) {
    return { ok: false, state, message: `Cannot reject a lead in status ${lead.status}.` };
  }
  const at = iso(deps.clock);
  let next = updateLead(state, leadId, (current) => transition(current, "Rejected", at));
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "rejected",
    lead_id: leadId,
    outcome: "ok",
    reason: "Operator rejected the draft. Execution will refuse this lead.",
  });
  return { ok: true, state: next, message: `Rejected ${lead.company}. This lead cannot be executed.` };
}

export function holdLead(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (lead.status !== "DraftGenerated") {
    return { ok: false, state, message: `Cannot hold a lead in status ${lead.status}.` };
  }
  const at = iso(deps.clock);
  let next = updateLead(state, leadId, (current) => transition(current, "Held", at));
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "held",
    lead_id: leadId,
    outcome: "ok",
    reason: "Operator placed the draft on hold. Execution will refuse this lead.",
  });
  return { ok: true, state: next, message: `Held ${lead.company}. This lead cannot be executed until it is approved.` };
}

function suppressRecipient(state: AppState, email: string): AppState {
  const normalized = normalizeEmail(email);
  const suppressedEmails = state.suppressedEmails.includes(normalized)
    ? state.suppressedEmails
    : [...state.suppressedEmails, normalized];
  return {
    ...state,
    suppressedEmails,
    leads: state.leads.map((lead) =>
      lead.recipient_email && normalizeEmail(lead.recipient_email) === normalized
        ? { ...lead, suppressed: true }
        : lead,
    ),
  };
}

function applyDelivery(
  state: AppState,
  lead: Lead,
  result: DeliveryResult,
  deps: EngineDeps,
): AppState {
  const at = iso(deps.clock);
  if (result.status === "sent") {
    let next = updateLead(state, lead.id, (current) =>
      transition({ ...current, send_count: current.send_count + 1 }, "Sent", at),
    );
    next = {
      ...next,
      // Quota accounting uses the application's clock, not an adapter's
      // wall-clock timestamp. Providers may report a different timestamp or
      // be tested with a fake clock; the accepted execution happened at `at`.
      successfulSendAt: [...next.successfulSendAt, at],
    };
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "send_succeeded",
      lead_id: lead.id,
      outcome: "sent",
      reason: `Provider ${result.provider} event ${result.event_id}.`,
    });
    return next;
  }

  if (result.status === "bounced") {
    let next = updateLead(state, lead.id, (current) => transition(current, "Failed", at));
    next = suppressRecipient(next, lead.recipient_email ?? "");
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "bounced",
      lead_id: lead.id,
      outcome: "bounced",
      reason: result.error ?? "Provider reported a bounce.",
    });
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "suppressed",
      lead_id: lead.id,
      outcome: "ok",
      reason: `Recipient ${lead.recipient_email} suppressed after bounce.`,
    });
    return next;
  }

  let next = updateLead(state, lead.id, (current) => transition(current, "Failed", at));
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "send_failed",
    lead_id: lead.id,
    outcome: "failed",
    reason: result.error ?? "Provider returned a failure.",
  });
  return next;
}

/**
 * Execute a single lead. Used by the batch helper and by tests that need
 * to prove the execution layer rejects illegal calls even when invoked
 * directly (no UI involved).
 */
export function executeLead(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  const limit = deps.dailyLimit ?? DAILY_SEND_LIMIT;
  const gate = executionEligibility(state, lead, deps.clock, limit);

  let next = appendEvent(state, deps.ids, deps.clock, {
    type: "send_attempted",
    lead_id: leadId,
    outcome: gate.ok ? "submitted" : "blocked",
    reason: gate.ok
      ? `Execution submitted to ${deps.email.name}.`
      : gate.reason,
  });

  if (!gate.ok) {
    return { ok: false, state: next, message: `Blocked: ${gate.reason}` };
  }

  if (!lead.generated_message?.trim()) {
    const reason = "No generated outreach draft is available.";
    next = appendEvent(next, deps.ids, deps.clock, {
      type: "send_attempted",
      lead_id: leadId,
      outcome: "blocked",
      reason,
    });
    return { ok: false, state: next, message: `Blocked: ${reason}` };
  }

  const result = deps.email.send({
    lead_id: lead.id,
    recipient: lead.recipient_email as string,
    subject: `Regarding ${lead.title}`,
    body: lead.generated_message,
  });

  next = applyDelivery(next, lead, result, deps);

  if (result.status === "sent") {
    return { ok: true, state: next, message: `Mock delivery succeeded for ${lead.company}.` };
  }
  if (result.status === "bounced") {
    return {
      ok: false,
      state: next,
      message: `Mock bounce for ${lead.company}. Lead was not marked Sent. Recipient suppressed.`,
    };
  }
  return {
    ok: false,
    state: next,
    message: `Mock delivery failed for ${lead.company}. Lead was not marked Sent.`,
  };
}

export function executeApproved(state: AppState, deps: EngineDeps): ActionResult {
  const approved = state.leads.filter((lead) => lead.status === "Approved");
  if (approved.length === 0) {
    return { ok: true, state, message: "No approved leads to execute." };
  }

  let next = state;
  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (const lead of approved) {
    const result = executeLead(next, lead.id, deps);
    next = result.state;
    if (result.ok) sent += 1;
    else if (result.message.startsWith("Blocked:")) blocked += 1;
    else failed += 1;
  }

  return {
    ok: sent > 0 || (failed === 0 && blocked === 0),
    state: next,
    message: `Execution finished: ${sent} sent, ${failed} failed, ${blocked} blocked. Failed and blocked leads were not marked Sent.`,
  };
}

export function simulateReply(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (lead.status !== "Sent") {
    return { ok: false, state, message: "Reply can only be simulated for a lead in Sent." };
  }
  const at = iso(deps.clock);
  let next = updateLead(state, leadId, (current) => transition(current, "Replied", at));
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "replied",
    lead_id: leadId,
    outcome: "ok",
    reason: "Simulated inbound reply (provider-neutral webhook stand-in).",
  });
  return { ok: true, state: next, message: `${lead.company} moved to Replied.` };
}

export function simulateBounce(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (lead.status !== "Sent" && lead.status !== "Replied") {
    return { ok: false, state, message: "Bounce can only be simulated after a successful send." };
  }
  if (!lead.recipient_email) {
    return { ok: false, state, message: "No recipient to suppress." };
  }
  let next = suppressRecipient(state, lead.recipient_email);
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "bounced",
    lead_id: leadId,
    outcome: "bounced",
    reason: "Simulated inbound bounce (provider-neutral webhook stand-in).",
  });
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "suppressed",
    lead_id: leadId,
    outcome: "ok",
    reason: `Recipient ${lead.recipient_email} suppressed after bounce.`,
  });
  return {
    ok: true,
    state: next,
    message: `Bounce recorded for ${lead.company}. Recipient suppressed. Lifecycle stays ${lead.status}.`,
  };
}

export function simulateUnsubscribe(state: AppState, leadId: string, deps: EngineDeps): ActionResult {
  const lead = requireLead(state, leadId);
  if (lead.status !== "Sent" && lead.status !== "Replied") {
    return { ok: false, state, message: "Unsubscribe can only be simulated after a successful send." };
  }
  if (!lead.recipient_email) {
    return { ok: false, state, message: "No recipient to suppress." };
  }
  let next = suppressRecipient(state, lead.recipient_email);
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "unsubscribed",
    lead_id: leadId,
    outcome: "ok",
    reason: "Simulated inbound unsubscribe (provider-neutral webhook stand-in).",
  });
  next = appendEvent(next, deps.ids, deps.clock, {
    type: "suppressed",
    lead_id: leadId,
    outcome: "ok",
    reason: `Recipient ${lead.recipient_email} suppressed after unsubscribe.`,
  });
  return {
    ok: true,
    state: next,
    message: `Unsubscribe recorded for ${lead.company}. Recipient suppressed.`,
  };
}
