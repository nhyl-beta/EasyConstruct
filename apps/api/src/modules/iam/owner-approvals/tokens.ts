// apps/api/src/modules/iam/owner-approvals/tokens.ts: pure, no database
//
// Same shape as the RFI reply link (design-requests/reply-tokens.ts): 32 random bytes shown once in the email and
// stored only as a SHA-256 hash; it expires and it works once. Reused, not reinvented.
// reply-tokens.ts is pure (it imports only node:crypto). Going through design/index.ts instead would load the whole
// design module and create an import cycle with the users service, so this one file is imported directly.
/* eslint-disable import/no-restricted-paths */
import {
  TOKEN_PATTERN,
  evaluateToken as evaluate,
  generateToken,
  hashToken,
  type TokenRow,
  type TokenState,
} from "../../design/design-requests/reply-tokens.js";
/* eslint-enable import/no-restricted-paths */

export { TOKEN_PATTERN, generateToken, hashToken };
export type { TokenState };

/** A decided, cancelled or expired request is spent. `usedAt` is the decision time. */
export const evaluateToken = (
  row: { expiresAt: Date; status: string; decidedAt: Date | null } | null | undefined,
  now: Date = new Date(),
): TokenState => {
  if (!row) return "missing";
  if (row.status === "expired") return "expired";
  const asToken: TokenRow = { expiresAt: row.expiresAt, usedAt: row.status === "pending" ? null : (row.decidedAt ?? new Date(0)) };
  return evaluate(asToken, now);
};

/** What the Owner is told for each state: friendly, and never revealing more than that. */
export const TOKEN_MESSAGES: Record<Exclude<TokenState, "ok">, { status: number; code: string; message: string }> = {
  missing: { status: 404, code: "APPROVAL_LINK_INVALID", message: "This approval link is not valid. Please use the link from the email you received." },
  expired: { status: 410, code: "APPROVAL_LINK_EXPIRED", message: "This approval link has expired, so nothing was changed. If you still want the change, ask for a new request." },
  used: { status: 410, code: "APPROVAL_LINK_USED", message: "This request has already been answered, so this link no longer does anything." },
};
