/**
 * Deterministic qualification.
 *
 * Scoring is a transparent weighted keyword match. The reviewer can read
 * `score_reason` and reconstruct the result without inspecting a model.
 * This is application logic, not an AI call.
 */

import type { Lead } from "./models.ts";

interface Factor {
  id: string;
  label: string;
  weight: number;
  terms: readonly string[];
}

const FACTORS: readonly Factor[] = [
  {
    id: "automation_pain",
    label: "Automation / integration pain",
    weight: 25,
    terms: [
      "automation",
      "integration",
      "manual",
      "spreadsheet",
      "handoff",
      "re-key",
      "rekey",
      "intake",
      "copy-paste",
      "copy paste",
      "workflow",
    ],
  },
  {
    id: "clear_problem",
    label: "Clear business problem",
    weight: 20,
    terms: [
      "fail",
      "unreliable",
      "broken",
      "disconnect",
      "lost",
      "duplicate",
      "miss",
      "delay",
      "drop",
      "stall",
      "error",
    ],
  },
  {
    id: "named_systems",
    label: "Named systems / tools",
    weight: 20,
    terms: [
      "crm",
      "webhook",
      "spreadsheet",
      "excel",
      "inbox",
      "shared drive",
      "csv",
      "form",
      "desktop",
      "routing",
    ],
  },
  {
    id: "buying_intent",
    label: "Buying-intent language",
    weight: 15,
    terms: [
      "need",
      "looking",
      "replace",
      "evaluate",
      "stopgap",
      "cannot scale",
      "can't scale",
      "help",
      "fix",
      "reliable",
    ],
  },
  {
    id: "ops_impact",
    label: "Operational impact",
    weight: 20,
    terms: [
      "hour",
      "week",
      "lead",
      "client",
      "deadline",
      "revenue",
      "follow-up",
      "follow up",
      "capacity",
      "double-book",
      "activation",
      "quote",
    ],
  },
];

export interface QualificationResult {
  score: number;
  score_reason: string;
  factors: { label: string; hits: string[]; points: number }[];
}

function uniqueHits(text: string, terms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of terms) {
    if (text.includes(term) && !found.includes(term)) found.push(term);
  }
  return found;
}

/**
 * Score a lead from its title + description. Same input always yields the
 * same score. Points per factor scale with how many of that factor's terms
 * matched, capped at the factor weight.
 */
export function qualifyText(title: string, description: string): QualificationResult {
  const text = `${title}\n${description}`.toLowerCase();
  const factors = FACTORS.map((factor) => {
    const hits = uniqueHits(text, factor.terms);
    const ratio = Math.min(1, hits.length / 3);
    const points = hits.length === 0 ? 0 : Math.round(factor.weight * (0.4 + 0.6 * ratio));
    return { label: factor.label, hits, points };
  });

  const score = Math.min(
    100,
    factors.reduce((sum, f) => sum + f.points, 0),
  );

  const parts = factors.map((f) => {
    if (f.hits.length === 0) return `${f.label} (+0, no matching signals)`;
    return `${f.label} (+${f.points}; matched: ${f.hits.join(", ")})`;
  });

  return {
    score,
    score_reason: `${parts.join(". ")}. Total ${score}/100.`,
    factors,
  };
}

export function qualifyLead(lead: Lead): Pick<Lead, "score" | "score_reason"> {
  const result = qualifyText(lead.title, lead.description);
  return { score: result.score, score_reason: result.score_reason };
}
