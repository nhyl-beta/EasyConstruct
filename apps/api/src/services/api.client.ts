const BASE = process.env.API_BASE_URL ?? "";

async function request(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    BASE ? `${BASE}/api${path}` : `/api${path}`,
    {
      ...options,
      headers,
    },
  );

  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `API error ${response.status}`;

    throw new Error(message);
  }

  return body;
}

export const apiClient = {
  get: (path: string) => request(path, { method: "GET" }),

  post: (path: string, body: unknown) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  postFormData: (path: string, formData: FormData) =>
    request(path, {
      method: "POST",
      body: formData,
    }),

  patch: (path: string, body: unknown) =>
    request(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  del: (path: string) =>
    request(path, {
      method: "DELETE",
    }),
};
