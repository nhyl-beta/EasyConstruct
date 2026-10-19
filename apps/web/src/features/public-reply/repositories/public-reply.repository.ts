// The public RFI/RFA reply page (client demo change #6). No login: every call is decided by the token in
// the link, so these use plain fetch and never send the app's session token.
import { apiUrl } from "@/services/api.client";

export interface PublicReplyAttachment {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PublicReplyRequest {
  companyName: string;
  projectName: string;
  requestNumber: string;
  kind: "RFI" | "RFA";
  subject: string;
  requestText: string;
  dueDate: string | null;
  recipientName: string;
  acceptsReply: boolean;
  attachments: PublicReplyAttachment[];
  maxFiles: number;
  maxFileMb: number;
}

/** An error the server worded for the recipient. `code` tells the page which kind of message box to show. */
export class PublicReplyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "PublicReplyError";
  }
}

const base = (token: string) => apiUrl(`/public/rfi-replies/${encodeURIComponent(token)}`);

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { data?: T; message?: string; code?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const fallback = res.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "Something went wrong. Please try again.";
    throw new PublicReplyError(json.message ?? fallback, res.status, json.code);
  }
  return json.data as T;
}

export const publicReplyRepository = {
  async open(token: string): Promise<PublicReplyRequest> {
    return parse<PublicReplyRequest>(await fetch(base(token), { headers: { Accept: "application/json" } }));
  },

  async submit(token: string, input: { answer: string; name: string; position: string; files: File[] }): Promise<{ requestNumber: string; files: number }> {
    const form = new FormData();
    form.append("answer", input.answer);
    form.append("name", input.name);
    form.append("position", input.position);
    for (const f of input.files) form.append("files", f, f.name);
    return parse(await fetch(base(token), { method: "POST", body: form }));
  },

  /** Saves an attachment of the request through the token (no session). */
  async downloadAttachment(token: string, attachment: PublicReplyAttachment): Promise<void> {
    const res = await fetch(`${base(token)}/files/${attachment.id}`);
    if (!res.ok) await parse(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
