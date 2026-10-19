// apps/api/src/proposals/validation.ts
//
// Deterministic, rule-based proposal validation: decision support only.
// This deliberately does NOT call any external AI service (none is
// configured anywhere in this repo); it is real logic that runs on every
// submission, not a placeholder. The result is stored (in the existing
// `aiValidation` column) and shown to reviewers, but never changes a
// proposal's status itself: a human reviewer always makes the actual call.
//
// Objectives fix 3.3: the checks now compare the proposal with its
// surroundings (similar past proposals, the contract, other proposals on the
// same project, what a proposal of this type normally covers). Every warning
// says what it was compared with, and `basis` lists the evidence used. The
// stored JSON stays backward compatible: `passed`, `issues`, `warnings` and
// `checkedAt` are unchanged; `version` and `basis` are additions.
import { dice } from "../ai-validation/matcher.js";
import { PROPOSAL_CHECKS } from "../core/config/signals.js";

/** Bump when the checks change; a stored result with an older version is recomputed. */
export const VALIDATION_VERSION = 2;

export interface ProposalValidationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  checkedAt: string;
  /** Absent on results stored before fix 3.3 (treated as version 1). */
  version?: number;
  /** What the checks compared this proposal with, in plain words. */
  basis?: string[];
}

export interface ProposalValidationInput {
  title: string;
  content?: string | null;
  amount?: string | null;
}

/** What the comparison checks need from the rest of the database. All optional: a missing piece skips its check. */
export interface ValidationContext {
  projectType?: string | null;
  contractValue?: number | null;
  /** Amounts of past proposals on projects of the same type (this proposal excluded). */
  similarAmounts?: number[];
  /** Other proposals on the same project (this proposal excluded). */
  siblings?: { proposalId: string; title: string; amount: number | null; createdAt: Date | null }[];
  now?: Date;
}

export const parseAmount = (amount: string | null | undefined): number | null => {
  if (!amount || !amount.trim()) return null;
  const n = Number(amount.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const php = (n: number) => `PHP ${Math.round(n).toLocaleString("en-PH")}`;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Sections a proposal of each project type is expected to cover; a section counts as covered when any keyword appears. */
export const REQUIRED_SECTIONS: Record<string, { name: string; keywords: string[] }[]> = {
  common: [
    { name: "Scope of work", keywords: ["scope", "deliverable", "work includes", "works include"] },
    { name: "Schedule", keywords: ["schedule", "timeline", "duration", "weeks", "months", "days"] },
    { name: "Cost basis", keywords: ["cost", "budget", "estimate", "php", "₱", "price"] },
  ],
  Commercial: [{ name: "Intended use or floor area", keywords: ["floor area", "sqm", "square met", "occupancy", "tenant", "use"] }],
  Residential: [{ name: "Unit or floor area details", keywords: ["floor area", "sqm", "square met", "bedroom", "lot", "unit", "storey", "story"] }],
  Infrastructure: [{ name: "Alignment or length", keywords: ["alignment", "length", "kilomet", "km", "survey", "drainage", "span"] }],
  Industrial: [{ name: "Capacity or process requirements", keywords: ["capacity", "load", "equipment", "process", "tonnes", "tons"] }],
  "Renewable Energy": [{ name: "Capacity", keywords: ["capacity", "kw", "mw", "kwp", "panel", "turbine", "grid"] }],
};

export function validateProposal(
  input: ProposalValidationInput,
  projectExists: boolean,
  projectCode: string,
  context: ValidationContext = {},
): ProposalValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const basis: string[] = [];
  const now = context.now ?? new Date();
  const C = PROPOSAL_CHECKS;

  if (!input.title || input.title.trim().length < 5) {
    issues.push("Title is missing or too short to describe the proposal.");
  }

  if (!projectExists) {
    issues.push(`Project code "${projectCode}" does not match any existing project.`);
  }

  const description = input.content?.trim() ?? "";
  if (description.length < 20) {
    warnings.push("Description is missing or very brief. Reviewers may need more context.");
  }

  const amount = parseAmount(input.amount);
  if (!input.amount || !input.amount.trim()) {
    warnings.push("No estimated amount provided.");
  } else if (Number.isNaN(Number(input.amount.replace(/[^\d.-]/g, "")))) {
    warnings.push(`Amount "${input.amount}" does not look like a valid number.`);
  }

  // 1. Amount against the median of past proposals on projects of the same type.
  if (amount != null) {
    const similar = (context.similarAmounts ?? []).filter((n) => n > 0);
    if (similar.length >= C.minSample) {
      const mid = median(similar);
      const typeName = context.projectType ?? "similar";
      const ratio = amount / mid;
      basis.push(`Amount compared with ${similar.length} past proposals on ${typeName} projects (median ${php(mid)}).`);
      if (ratio >= C.highFactor) {
        warnings.push(
          `Amount ${php(amount)} is ${ratio.toFixed(1)} times the median ${php(mid)} (vs ${similar.length} similar proposals, ${typeName} projects).`,
        );
      } else if (ratio <= C.lowFactor) {
        warnings.push(
          `Amount ${php(amount)} is only ${Math.round(ratio * 100)}% of the median ${php(mid)} (vs ${similar.length} similar proposals, ${typeName} projects).`,
        );
      }
    } else if (context.projectType) {
      basis.push(
        `Not enough past ${context.projectType} proposals to compare the amount (${similar.length} found, ${C.minSample} needed).`,
      );
    }
  }

  // 2. Amount against the contract value.
  if (amount != null && context.contractValue != null && context.contractValue > 0) {
    basis.push(`Amount compared with the contract value ${php(context.contractValue)}.`);
    if (amount > context.contractValue) {
      warnings.push(
        `Amount ${php(amount)} is more than the project's contract value ${php(context.contractValue)} (${Math.round((amount / context.contractValue) * 100)}% of it).`,
      );
    }
  }

  // 3. Possible duplicates: same project, similar title, close amount, recent.
  const siblings = context.siblings ?? [];
  if (siblings.length > 0 && input.title) {
    basis.push(`Checked ${siblings.length} other proposal${siblings.length === 1 ? "" : "s"} on ${projectCode} for duplicates.`);
    for (const s of siblings) {
      const similarity = dice(input.title, s.title);
      if (similarity < C.duplicateTitleSimilarity) continue;
      const closeAmount =
        amount == null || s.amount == null ? amount == null && s.amount == null : Math.abs(amount - s.amount) / Math.max(amount, s.amount) <= C.duplicateAmountPct;
      if (!closeAmount) continue;
      const ageDays = s.createdAt ? Math.floor((now.getTime() - s.createdAt.getTime()) / 86_400_000) : null;
      if (ageDays != null && ageDays > C.duplicateWindowDays) continue;
      warnings.push(
        `Possible duplicate of ${s.proposalId} "${s.title}" (${Math.round(similarity * 100)}% similar title, amount within ${Math.round(C.duplicateAmountPct * 100)}%` +
          `${ageDays != null ? `, filed ${ageDays} day${ageDays === 1 ? "" : "s"} ago` : ""}).`,
      );
    }
  }

  // 4. Required sections by project type (only judged once there is a real description).
  if (description.length >= 20) {
    const required = [...REQUIRED_SECTIONS.common!, ...(context.projectType ? (REQUIRED_SECTIONS[context.projectType] ?? []) : [])];
    const text = description.toLowerCase();
    const missing = required.filter((section) => !section.keywords.some((k) => text.includes(k)));
    basis.push(
      `Description checked for ${required.length} expected sections${context.projectType ? ` (${context.projectType} projects)` : ""}.`,
    );
    for (const section of missing) {
      warnings.push(
        `Description does not seem to cover "${section.name}" (looked for: ${section.keywords.slice(0, 4).join(", ")}).`,
      );
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    checkedAt: now.toISOString(),
    version: VALIDATION_VERSION,
    basis,
  };
}

/** Roles allowed to trigger POST /proposals/:id/validate. */
export const PROPOSAL_VALIDATE_ROLES = ["consultant", "project-manager", "architect", "admin"] as const;

/** True when a stored result was produced by the current version of the checks. */
export const isCurrentValidation = (stored: string | null | undefined): boolean => {
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored) as { version?: number };
    return (parsed.version ?? 1) >= VALIDATION_VERSION;
  } catch {
    // Unparseable text is not something to keep re-computing every time it is read.
    return true;
  }
};

/**
 * Computes the stored validation JSON when none exists yet or the stored one was
 * made by an older version of the checks. A current result is returned
 * unchanged, so asking twice never rewrites (or re-timestamps) what a reviewer
 * already saw.
 */
export function ensureValidation(
  proposal: ProposalValidationInput & { aiValidation?: string | null; projectCode: string },
  projectExists: boolean,
  context: ValidationContext = {},
): { changed: boolean; aiValidation: string } {
  if (proposal.aiValidation && isCurrentValidation(proposal.aiValidation)) {
    return { changed: false, aiValidation: proposal.aiValidation };
  }
  const result = validateProposal(
    { title: proposal.title, content: proposal.content, amount: proposal.amount },
    projectExists,
    proposal.projectCode,
    context,
  );
  return { changed: true, aiValidation: JSON.stringify(result) };
}
