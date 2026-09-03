/**
 * Explicit lifecycle transitions.
 *
 * The UI never mutates `lead.status` directly. Application functions call
 * `transition()` so illegal jumps (e.g. Discovered → Sent) are rejected here,
 * not by hiding a button.
 */

import type { Lead, LeadStatus } from "./models.ts";

export const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  Discovered: ["Qualified"],
  Qualified: ["Analyzed"],
  Analyzed: ["DraftGenerated"],
  DraftGenerated: ["Approved", "Rejected", "Held"],
  Held: ["Approved", "Rejected"],
  Approved: ["Sent", "Failed"],
  Rejected: [],
  Sent: ["Replied"],
  Replied: [],
  Failed: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transition(lead: Lead, to: LeadStatus, at: string): Lead {
  if (!canTransition(lead.status, to)) {
    throw new Error(`Illegal lifecycle transition: ${lead.status} → ${to}`);
  }
  return { ...lead, status: to, updated_at: at };
}

/** Statuses that may receive a human review decision. */
export const REVIEWABLE: ReadonlySet<LeadStatus> = new Set([
  "DraftGenerated",
  "Held",
]);

/** Only Approved leads may enter the execution service. */
export function isExecutableStatus(status: LeadStatus): boolean {
  return status === "Approved";
}
