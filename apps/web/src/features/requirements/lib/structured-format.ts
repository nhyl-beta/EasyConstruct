// Text helpers for the "Structure with AI" panel. The server returns the
// structured description; accepting a suggestion or undoing one rewording
// edits that text in place, so anything the engineer typed afterwards is kept.
import type { StructuredSection } from "../types/requirements.types";

export const SECTION_HEADINGS: Record<StructuredSection, string> = {
  objectives: "Objectives",
  materials: "Materials",
  constraints: "Constraints",
  specifications: "Specifications",
};

const HEADING_SET = new Set(Object.values(SECTION_HEADINGS));
const EMPTY_BULLET = "- (none stated)";

/** Appends a bullet to the end of a section's block, creating the block if missing. */
export function appendToSection(description: string, section: StructuredSection, item: string): string {
  const lines = description.split("\n");
  const headingAt = lines.findIndex((l) => l.trim() === SECTION_HEADINGS[section]);
  const bullet = `- ${item}`;
  if (headingAt === -1) {
    return `${description.trimEnd()}\n\n${SECTION_HEADINGS[section]}\n${bullet}`;
  }
  let end = headingAt + 1;
  while (end < lines.length && !HEADING_SET.has(lines[end].trim())) end++;
  // Last non-empty line inside the block.
  let last = end - 1;
  while (last > headingAt && lines[last].trim() === "") last--;
  if (lines[last]?.trim() === EMPTY_BULLET) {
    lines[last] = bullet;
  } else {
    lines.splice(last + 1, 0, bullet);
  }
  return lines.join("\n");
}

/** Reverts one rewording ("to" back to "from") everywhere in the text. */
export function undoRewrite(description: string, rewrite: { from: string; to: string }): string {
  return description.split(rewrite.to).join(rewrite.from);
}
