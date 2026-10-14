// Reading the stored proposal validation result (objectives fix 3.3).

/** Mirrors VALIDATION_VERSION in server/src/proposals/validation.ts. */
export const VALIDATION_VERSION = 2;

export interface ParsedValidation {
  passed: boolean;
  issues: string[];
  warnings: string[];
  checkedAt?: string;
  version?: number;
  basis?: string[];
}

export function parseValidation(raw: string | null | undefined): ParsedValidation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedValidation;
    return Array.isArray(parsed.issues) && Array.isArray(parsed.warnings) ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a stored result predates the current checks and should be recomputed. */
export const isStaleValidation = (raw: string | null | undefined): boolean => {
  const parsed = parseValidation(raw);
  return parsed != null && (parsed.version ?? 1) < VALIDATION_VERSION;
};

