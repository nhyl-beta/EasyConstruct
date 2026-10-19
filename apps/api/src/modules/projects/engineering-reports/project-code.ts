// apps/api/src/engineering-reports/project-code.ts
//
// A report is tied to its project by the project's code, and everything that
// reads reports (the PM's Reports list, gate X1, project scoping) matches that
// code exactly. A report filed under a code that matches no project is invisible
// to all of them, so the code is resolved to the stored one when a report is
// created.

/**
 * The stored code for what the caller typed or picked: an exact match wins;
 * otherwise a single case-insensitive match is accepted (so "ZH-01" finds
 * "Zh-01"); anything else is null.
 */
export const resolveProjectCode = (input: string, storedCodes: string[]): string | null => {
  const wanted = input.trim();
  if (!wanted) return null;
  if (storedCodes.includes(wanted)) return wanted;
  const loose = storedCodes.filter((c) => c.toLowerCase() === wanted.toLowerCase());
  return loose.length === 1 ? loose[0]! : null;
};
