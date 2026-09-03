/**
 * AI provider boundary.
 *
 * Application
 *      ↓
 * AI Provider Interface
 *      ↓
 * MockAIProvider
 *
 * AI output is diagnosis and copy. It never authorizes execution, never
 * mutates lifecycle, and never calls a delivery provider.
 *
 * A production implementation could replace MockAIProvider with a Claude-backed
 * adapter, an OpenAI-compatible adapter, or a local-model adapter while
 * preserving this control boundary. Those adapters are not implemented here.
 */

import type { Lead } from "./models.ts";

export interface Diagnosis {
  summary: string;
  bottleneck: string;
}

export interface AIProvider {
  readonly name: string;
  diagnose(lead: Lead): Diagnosis;
  draft(lead: Lead): string;
}

function detectSystems(text: string): string {
  const systems = ["CRM", "webhooks", "spreadsheets", "shared inbox", "desktop database"] as const;
  const lower = text.toLowerCase();
  const found = systems.filter((s) => lower.includes(s.toLowerCase().replace(/s$/, "")) || lower.includes(s.toLowerCase()));
  if (found.length === 0) {
    if (lower.includes("crm")) return "a CRM";
    if (lower.includes("webhook")) return "webhooks";
    if (lower.includes("spreadsheet") || lower.includes("excel")) return "spreadsheets";
    if (lower.includes("inbox") || lower.includes("email")) return "a shared inbox";
    return "the current intake path";
  }
  if (found.length === 1) return found[0].toLowerCase();
  return `${found.slice(0, -1).join(", ").toLowerCase()} and ${found[found.length - 1].toLowerCase()}`;
}

/**
 * Deterministic stand-in for a language model.
 * The same lead always produces the same diagnosis and draft.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "MockAIProvider";

  diagnose(lead: Lead): Diagnosis {
    const blob = `${lead.title} ${lead.description}`;
    const systems = detectSystems(blob);
    const bottleneck = inferBottleneck(blob, systems);
    const summary =
      `${lead.company} is losing operational reliability at the ${systems} boundary. ` +
      `The described failure is consistent with a process that depends on human re-entry rather than a verified handoff.`;
    return { summary, bottleneck };
  }

  draft(lead: Lead): string {
    const { bottleneck } = this.diagnose(lead);
    return [
      `Hello ${lead.company} team,`,
      ``,
      `I reviewed a public description of how ${lead.title.toLowerCase()} is currently handled. ` +
        `The pattern that stands out is: ${bottleneck}`,
      ``,
      `If that matches what you are seeing, the useful next step is a bounded inspection of the failing handoff — identify the agreed failure, repair it, and verify the result — rather than a broad tooling overhaul.`,
      ``,
      `This message is a draft for human review. It will not be sent unless an operator approves it and a separate execution step runs.`,
      ``,
      `— Outreach draft (generated, not sent)`,
    ].join("\n");
  }
}

function inferBottleneck(text: string, systems: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("double-book") || lower.includes("routing")) {
    return `duplicate assignment through ${systems}, so two people act on the same inquiry.`;
  }
  if (lower.includes("webhook")) {
    return `webhook delivery is not idempotent, so downstream systems activate twice or not at all.`;
  }
  if (lower.includes("unreliable") || lower.includes("drop")) {
    return `an automation path that drops work without a visible failure, forcing a manual rebuild.`;
  }
  if (lower.includes("spreadsheet") || lower.includes("excel") || lower.includes("re-key") || lower.includes("intake")) {
    return `manual re-keying between ${systems} and the system of record, which silently drops follow-up.`;
  }
  return `a manual gap around ${systems} that cannot be observed when it fails.`;
}
