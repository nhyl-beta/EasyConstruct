// apps/api/src/issues/precedents.ts
//
// Pure ranking for "similar issue resolved before" (no I/O, like
// ai-validation/matcher.ts). Candidates are resolved issues that carry
// resolution notes. Text similarity is the Dice coefficient over
// title + description; a same-category candidate gets a small bonus to the
// ranking score but is never required (category is not a hard filter).
// Anything whose TEXT similarity is under SIMILARITY_FLOOR is dropped, so a
// category match alone never produces a suggestion.
import { dice } from "../../insights/index.js";
import { SIMILARITY_FLOOR } from "../../../core/config/signals.js";

export const SAME_CATEGORY_BONUS = 0.05;
export const MAX_PRECEDENTS = 2;

export interface PrecedentSubject {
  id: number;
  title: string;
  description: string;
  category: string;
}

export interface PrecedentCandidate extends PrecedentSubject {
  issueCode: string;
  projectCode: string;
  resolutionNotes: string | null;
  updatedAt: Date | null;
}

export interface RankedPrecedent {
  issueCode: string;
  projectCode: string;
  title: string;
  resolutionNotes: string;
  resolvedAt: Date | null;
  score: number;
}

const text = (i: { title: string; description: string }) => `${i.title} ${i.description}`;

export const rankPrecedents = (
  subject: PrecedentSubject,
  candidates: PrecedentCandidate[],
  limit = MAX_PRECEDENTS,
): RankedPrecedent[] => {
  const scored: { c: PrecedentCandidate; score: number }[] = [];
  for (const c of candidates) {
    if (c.id === subject.id) continue;
    if (!c.resolutionNotes?.trim()) continue;
    const similarity = dice(text(subject), text(c));
    if (similarity < SIMILARITY_FLOOR) continue;
    const bonus = c.category === subject.category ? SAME_CATEGORY_BONUS : 0;
    scored.push({ c, score: Math.min(1, similarity + bonus) });
  }
  // Higher score first; ties break on the lower id so the result does not
  // depend on the order the database returned rows in.
  scored.sort((a, b) => b.score - a.score || a.c.id - b.c.id);
  return scored.slice(0, limit).map(({ c, score }) => ({
    issueCode: c.issueCode,
    projectCode: c.projectCode,
    title: c.title,
    resolutionNotes: c.resolutionNotes!.trim(),
    resolvedAt: c.updatedAt,
    score: Math.round(score * 100) / 100,
  }));
};
