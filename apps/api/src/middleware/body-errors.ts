// Maps body-parser failures to a 400 instead of a 500 (pure). express.json() raises these before any
// route runs: malformed JSON ("entity.parse.failed") and bodies it cannot decode.
export interface MappedBodyError {
  status: number;
  code: string;
  message: string;
}

export function mapBodyParserError(err: unknown): MappedBodyError | null {
  const e = err as { type?: unknown; status?: unknown; statusCode?: unknown } | null;
  const type = typeof e?.type === "string" ? e.type : "";
  if (type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "The request body is not valid JSON." };
  }
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return { status: 415, code: "UNSUPPORTED_ENCODING", message: "The request body uses an unsupported encoding." };
  }
  if (type === "request.aborted" || type === "request.size.invalid") {
    return { status: 400, code: "BAD_REQUEST_BODY", message: "The request body could not be read." };
  }
  return null;
}
