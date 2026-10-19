// apps/api/src/utils/diff-fields.ts: pure, no I/O (client demo change #3)
//
// "What changed" for an audit line: only the fields whose value is different, as old -> new.
// Secrets are never written: a field whose name looks like one is skipped altogether.

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

const SECRET_NAME = /pass(word)?|secret|token|api[_-]?key|hash|credential/i;
const MAX_VALUE = 80;

/** A short, readable form of a value for a log line. */
export const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
};

const comparable = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "object" ? JSON.stringify(value) : String(value).trim();
};

/**
 * Fields of `after` (the ones the caller touched) whose value differs from `before`. A numeric 5000000 and
 * the string "5000000.00" a numeric column returns are treated as equal.
 */
export const diffFields = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: { ignore?: readonly string[] } = {},
): FieldChange[] => {
  const ignore = new Set(opts.ignore ?? []);
  const changes: FieldChange[] = [];
  for (const field of Object.keys(after)) {
    if (ignore.has(field) || SECRET_NAME.test(field)) continue;
    const a = comparable(before[field]);
    const b = comparable(after[field]);
    if (a === b) continue;
    const bothNumbers = a !== "" && b !== "" && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
    if (bothNumbers && Number(a) === Number(b)) continue;
    changes.push({ field, from: displayValue(before[field]), to: displayValue(after[field]) });
  }
  return changes;
};

export const formatChanges = (changes: readonly FieldChange[]): string =>
  changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join("; ");
