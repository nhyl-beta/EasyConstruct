// Maps Postgres errors that mean "the request was bad" or "conflicts with the data" to HTTP
// answers, so they are not reported as a 500. Pure: takes any thrown value.
//
// drizzle-orm wraps the raw pg error, so the code can be on err.cause rather than on err.

export interface MappedPgError {
  status: number;
  code: string;
  message: string;
}

const pgCodeOf = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
};

const detailOf = (err: unknown): string | undefined => {
  const e = err as { detail?: unknown; cause?: { detail?: unknown } } | null;
  const d = e?.detail ?? e?.cause?.detail;
  return typeof d === "string" ? d : undefined;
};

export function mapPgError(err: unknown): MappedPgError | null {
  switch (pgCodeOf(err)) {
    case "23505": // unique_violation
      return { status: 409, code: "CONFLICT", message: detailOf(err) ?? "A record with these details already exists." };
    case "22P02": // invalid_text_representation, e.g. "abc" where a number is expected
      return { status: 400, code: "VALIDATION_ERROR", message: "A value in the request has the wrong format (for example a non-numeric id)." };
    case "23502": // not_null_violation, e.g. a required field missing from the body
      return { status: 400, code: "VALIDATION_ERROR", message: "A required field is missing." };
    case "23503": // foreign_key_violation
      return { status: 409, code: "CONFLICT", message: "This record refers to, or is used by, another record that does not allow it." };
    default:
      return null;
  }
}
