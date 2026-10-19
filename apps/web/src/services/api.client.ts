/* eslint-disable @typescript-eslint/no-explicit-any */
import { UNAUTHORIZED_EVENT, getToken } from "@/auth/session";
import { queryClient } from "@/lib/query-client";
import { invalidateAfterWrite } from "@/lib/query-invalidation";
import { resourceOf } from "@/lib/query-keys";

const BASE = import.meta.env.VITE_API_BASE || "";

function authHeader(): Record<string, string> {
  const token = getToken();

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

async function parseResponse(res: Response) {
  const text = await res.text();

  if (!res.ok) {
    // A 401 on an authenticated call means the session is over (expired, or
    // revoked by a password change). Tell the AuthProvider, which clears the
    // stored session and sends the user to the login page.
    if (res.status === 401 && getToken()) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    let message = `API error ${res.status}`;
    let body: unknown;

    try {
      const json = JSON.parse(text);
      message = json.message ?? message;
      body = json;
    } catch {
      if (text) {
        message = `${message}: ${text}`;
      }
    }

    const error = new Error(message) as Error & { status?: number; body?: unknown };
    error.status = res.status;
    // Extra fields an AppError attached (e.g. GateBlockedError's `failing`
    // array) — callers that need more than the message read this instead of
    // re-parsing the string.
    error.body = body;
    throw error;
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export function apiUrl(path: string) {
  return BASE ? `${BASE}/api${path}` : `/api${path}`;
}

async function request(
  path: string,
  opts: RequestInit = {},
) {
  const {
    headers: optionHeaders,
    ...rest
  } = opts;

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(optionHeaders ?? {}),
    },
  });

  return parseResponse(res);
}

async function requestFormData(
  path: string,
  formData: FormData,
) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });

  return parseResponse(res);
}

// C1: EventSource can't set an Authorization header, so the one SSE endpoint
// takes the token as a query param instead (see server middleware/auth.ts).
export function streamUrl(path: string): string {
  const token = getToken();
  const url = new URL(apiUrl(path), window.location.origin);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

// Binary GET (stored files). Throws the same Error shape as request() so the
// 401 handler and callers treat it uniformly.
async function requestBlob(path: string): Promise<Blob> {
  const res = await fetch(apiUrl(path), { headers: authHeader() });
  if (!res.ok) {
    await parseResponse(res);
  }
  return res.blob();
}

// Notifications are live: never shared, never cached (they also arrive over SSE).
const isLive = (path: string) => resourceOf(path) === "notifications";

type GetOptions = RequestInit & {
  /** Keep the answer for this long (ms) and reuse it across screens. Default 0: always ask, but identical requests in flight at once share one network call. */
  staleTime?: number;
};

/**
 * GET through the shared TanStack Query client: two components asking for the
 * same path at the same moment (the header and the sidebar both want the
 * approvals badge) make one request, and a caller that passes `staleTime`
 * reuses the answer until it is older than that. Callers get their own copy of
 * the data, so sorting a result in place cannot change what another screen sees.
 */
async function cachedGet(path: string, opts: GetOptions = {}) {
  const { staleTime = 0, ...init } = opts;
  // An abortable request, or a live resource, goes straight to the network.
  if (init.signal || isLive(path)) return request(path, { ...init, method: "GET" });
  const data = await queryClient.fetchQuery({
    queryKey: ["api", resourceOf(path), "get", path],
    queryFn: () => request(path, { ...init, method: "GET" }),
    staleTime,
    gcTime: Math.max(staleTime, 60_000),
  });
  return typeof structuredClone === "function" ? structuredClone(data) : data;
}

/** Runs a write, then refreshes the cached reads it can have changed. */
async function write<T>(path: string, run: () => Promise<T>): Promise<T> {
  const result = await run();
  void invalidateAfterWrite(path);
  return result;
}

export const apiClient = {
  getBlob: (path: string) => requestBlob(path),

  get: (path: string, opts: GetOptions = {}) => cachedGet(path, opts),

  post: (path: string, body: any) =>
    write(path, () =>
      request(path, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),

  postFormData: (
    path: string,
    formData: FormData,
  ) => write(path, () => requestFormData(path, formData)),

  patch: (path: string, body: any) =>
    write(path, () =>
      request(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    ),

  del: (path: string) =>
    write(path, () =>
      request(path, {
        method: "DELETE",
      }),
    ),
};
