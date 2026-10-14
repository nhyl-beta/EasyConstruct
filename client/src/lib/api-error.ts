// Helpers for the structured errors the API sends back (see services/api.client.ts):
// the response body is kept on `error.body`, with `code` and any extra fields
// (for example `matches` on a duplicate-name refusal).
export interface ApiErrorBody {
  code?: string;
  message?: string;
  matches?: { id: number; name: string; score: number; exact: boolean; code?: string; employeeId?: string }[];
  existing?: { id: number; name: string } | null;
}

export const errorBody = (e: unknown): ApiErrorBody | null => {
  const body = (e as { body?: unknown } | null)?.body;
  return body && typeof body === "object" ? (body as ApiErrorBody) : null;
};

export const errorCode = (e: unknown): string | undefined => errorBody(e)?.code;
