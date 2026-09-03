/**
 * Domain types for the reference implementation.
 *
 * These shapes are the contract between deterministic application logic
 * (lifecycle, eligibility, execution) and replaceable providers (AI, delivery).
 */

export const LEAD_STATUSES = [
  "Discovered",
  "Qualified",
  "Analyzed",
  "DraftGenerated",
  "Approved",
  "Rejected",
  "Held",
  "Sent",
  "Replied",
  "Failed",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  company: string;
  title: string;
  source: string;
  description: string;
  score: number | null;
  score_reason: string | null;
  diagnosis: string | null;
  generated_message: string | null;
  status: LeadStatus;
  recipient_email: string | null;
  send_count: number;
  suppressed: boolean;
  created_at: string;
  updated_at: string;
}

export const EVENT_TYPES = [
  "lead_created",
  "qualified",
  "analyzed",
  "draft_generated",
  "approved",
  "rejected",
  "held",
  "send_attempted",
  "send_succeeded",
  "send_failed",
  "bounced",
  "unsubscribed",
  "replied",
  "suppressed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface SystemEvent {
  id: string;
  type: EventType;
  lead_id: string | null;
  at: string;
  /** Short human-readable outcome, e.g. "ok", "blocked", "failed". */
  outcome: string;
  reason?: string;
}

export interface AppState {
  leads: Lead[];
  events: SystemEvent[];
  /** Normalized (lowercase) recipient addresses that must not be contacted. */
  suppressedEmails: string[];
  /** ISO timestamps of successful mock deliveries, used for the daily quota. */
  successfulSendAt: string[];
}

export interface Clock {
  now(): Date;
}

export interface IdFactory {
  next(prefix: string): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function createIdFactory(): IdFactory {
  return {
    next(prefix: string) {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
      }
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    },
  };
}

/** Deterministic IDs for tests. */
export function createSequentialIds(start = 0): IdFactory {
  let n = start;
  return {
    next(prefix: string) {
      n += 1;
      return `${prefix}_${n}`;
    },
  };
}

export const DAILY_SEND_LIMIT = 5;

export function iso(clock: Clock): string {
  return clock.now().toISOString();
}

export function utcDay(clock: Clock): string {
  return clock.now().toISOString().slice(0, 10);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return EMAIL_PATTERN.test(value.trim());
}
