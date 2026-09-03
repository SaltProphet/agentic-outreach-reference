/**
 * Completely fictional seed leads.
 * No real companies, people, or recipient addresses.
 */

import type { AppState, Clock, Lead, SystemEvent } from "./models.ts";
import { iso } from "./models.ts";

/** Frozen so SSR and the browser hydrate the same seed. */
export const SEED_AT = "2026-09-02T15:00:00.000Z";
const seedClock: Clock = { now: () => new Date(SEED_AT) };

const SOURCE = "Demo seed";

function lead(
  clock: Clock,
  partial: Omit<Lead, "score" | "score_reason" | "diagnosis" | "generated_message" | "status" | "recipient_email" | "send_count" | "suppressed" | "created_at" | "updated_at">,
): Lead {
  const at = iso(clock);
  return {
    ...partial,
    score: null,
    score_reason: null,
    diagnosis: null,
    generated_message: null,
    status: "Discovered",
    recipient_email: null,
    send_count: 0,
    suppressed: false,
    created_at: at,
    updated_at: at,
  };
}

export function fictionalLeads(_clock?: Clock): Lead[] {
  const clock = seedClock;
  return [
    lead(clock, {
      id: "lead_northline",
      company: "Northline Components",
      title: "Manual CRM intake on the shop floor",
      source: SOURCE,
      description:
        "A mid-size parts manufacturer still takes new-customer intake on paper, then re-keys the same fields into a desktop CRM each afternoon. Follow-up is lost when the afternoon batch is delayed. Sales spends hours each week on the handoff and needs a reliable intake path that does not depend on a second manual pass.",
    }),
    lead(clock, {
      id: "lead_hale",
      company: "Hale & Whitford LLP",
      title: "Unreliable workflow automation for matter intake",
      source: SOURCE,
      description:
        "A small litigation firm runs a workflow automation that silently drops new-matter packets. Paralegals rebuild the file by hand before client deadlines. The automation is treated as a stopgap they cannot scale; they are looking to replace the failing path rather than add another tool.",
    }),
    lead(clock, {
      id: "lead_packetlane",
      company: "Packetlane Software",
      title: "Disconnected webhook systems after checkout",
      source: SOURCE,
      description:
        "A five-person SaaS company fires webhooks from billing into provisioning. The same event sometimes arrives twice and sometimes not at all, so customer activations fail. Engineering spends hours tracing the disconnected integration and needs the handoff to be idempotent.",
    }),
    lead(clock, {
      id: "lead_meridian",
      company: "Meridian Field Agency",
      title: "Duplicate lead routing to coordinators",
      source: SOURCE,
      description:
        "An independent field-service agency routes inbound inquiries through a shared inbox and a spreadsheet. Duplicate routing assigns the same lead to two coordinators, who then double-book intro calls. Capacity is lost every week on the duplicate follow-up.",
    }),
    lead(clock, {
      id: "lead_oakridge",
      company: "Oakridge Contractors",
      title: "Spreadsheet and inbox follow-up for quotes",
      source: SOURCE,
      description:
        "A residential contractor tracks quotes in Excel and a shared inbox. Follow-up stalls when a row is not updated, and clients wait. The owner wants the manual follow-up replaced with a process that surfaces missed quotes before the week is lost.",
    }),
    lead(clock, {
      id: "lead_willowbrook",
      company: "Willowbrook Book Circle",
      title: "Monthly reading-group newsletter",
      source: SOURCE,
      description:
        "A neighborhood book circle sends a monthly note to members about the next title. They mentioned they might try a nicer template someday. There is no operational failure, no named production system, and no buying-intent language.",
    }),
  ];
}

export function createInitialState(_clock?: Clock): AppState {
  const clock = seedClock;
  const leads = fictionalLeads(clock);
  const at = iso(clock);
  const events: SystemEvent[] = leads.map((item, index) => ({
    id: `evt_seed_${index + 1}`,
    type: "lead_created",
    lead_id: item.id,
    at,
    outcome: "seeded",
    reason: "Fictional demo lead created.",
  }));
  return {
    leads,
    events,
    suppressedEmails: [],
    successfulSendAt: [],
  };
}
