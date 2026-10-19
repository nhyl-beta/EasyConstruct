// apps/api/src/design-requests/reply-tokens.ts: pure, no database (client demo change #6)
//
// The link a stakeholder answers an RFI/RFA through without logging in. The token is 32 random bytes
// (256 bits), shown once in the email, and stored only as a SHA-256 hash. It expires, and it works once.
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_BYTES = 32;
export const DEFAULT_TOKEN_DAYS = 14;
/** A token as it appears in a url: base64url of 32 bytes is 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateToken = (): string => randomBytes(TOKEN_BYTES).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Days a link stays valid: RFI_REPLY_TOKEN_DAYS, or 14 when unset or not a sensible number. */
export const tokenDays = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : DEFAULT_TOKEN_DAYS;
};

export const expiryFor = (now: Date, days: number): Date => new Date(now.getTime() + days * 86_400_000);

export type TokenState = "ok" | "missing" | "expired" | "used";

export interface TokenRow {
  expiresAt: Date;
  usedAt: Date | null;
}

/** Where a presented token stands. A used token is "used" even after it also expired. */
export const evaluateToken = (row: TokenRow | null | undefined, now: Date = new Date()): TokenState => {
  if (!row) return "missing";
  if (row.usedAt) return "used";
  if (now.getTime() >= row.expiresAt.getTime()) return "expired";
  return "ok";
};

/** What the recipient is told for each state: friendly, and never revealing which part was wrong beyond that. */
export const TOKEN_MESSAGES: Record<Exclude<TokenState, "ok">, { status: number; code: string; message: string }> = {
  missing: { status: 404, code: "REPLY_LINK_INVALID", message: "This reply link is not valid. Please use the link from the email you received, or ask the sender to resend it." },
  expired: { status: 410, code: "REPLY_LINK_EXPIRED", message: "This reply link has expired. Please ask the sender to send the request again." },
  used: { status: 410, code: "REPLY_LINK_USED", message: "A reply has already been sent through this link. Thank you. If you need to add something, please contact the sender." },
};

/** The page the email points at, on the browser app. */
export const replyUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, "")}/reply/${token}`;

/** Is a file in the request's own request-stage attachments? Keeps the public download inside one request. */
export const fileBelongsToRequest = (file: { requestId: number; stage: string } | null | undefined, requestId: number): boolean =>
  !!file && file.requestId === requestId && file.stage === "request";

/** Limits on what the public form accepts. */
export const replyLimits = (env: { files?: string; fileMb?: string }) => {
  const files = Number(env.files);
  const mb = Number(env.fileMb);
  return {
    maxFiles: Number.isInteger(files) && files >= 0 && files <= 10 ? files : 5,
    maxFileBytes: (Number.isFinite(mb) && mb >= 1 && mb <= 50 ? mb : 4) * 1024 * 1024,
  };
};

export const REPLY_TEXT_MIN = 3;
export const REPLY_TEXT_MAX = 10_000;
