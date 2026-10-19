import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import * as repo from "./repository.js";
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from "../core/utils/errors.js";
import { env } from "../core/config/env.js";
import { logAudit } from "../core/audit/audit.js";
import { assertMailConfigured, sendMail } from "../core/mail/mailer.js";
import { invalidateSessionCache } from "../core/auth/middleware.js";
import { LOGIN_THROTTLE, throttleMessage, throttleState } from "../core/auth/throttle.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  OwnerRecoveryResult,
  ResetPasswordInput,
} from "./types.js";

const JWT_EXPIRES_IN = "30d";
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 10;

/**
 * Records every sign-in attempt, successful or not, into the existing audit
 * trail rather than a parallel table — audit_logs already stores
 * actor/action/summary and is already surfaced by the Security and System
 * Oversight screens, so login history lands where operators look.
 *
 * `entityType` is "auth" and `action` is "login" / "login-failed", which is
 * what the oversight panel filters on.
 */
const recordLoginAttempt = (
  email: string,
  outcome: "login" | "login-failed" | "login-throttled" | "logout",
  summary: string,
  actorName?: string,
) =>
  logAudit({
    entityType: "auth",
    entityId: email,
    action: outcome,
    actor: actorName ?? email,
    summary,
  });

export const login = async (input: LoginInput) => {
  // Fix 1.5: after repeated failures for this account, refuse further attempts for
  // a while. Read from the audit trail, so it holds on every serverless instance.
  const since = new Date(Date.now() - LOGIN_THROTTLE.windowMinutes * 60_000);
  const failures = await repo.findRecentLoginFailures(input.email, since, LOGIN_THROTTLE.maxFailures);
  const throttle = throttleState(failures);
  if (throttle.blocked) {
    // Logged under its own action, which the limit does not count, so a refused
    // attempt cannot extend its own lockout.
    await recordLoginAttempt(input.email, "login-throttled", "Sign-in refused: too many failed attempts");
    throw new AppError(429, "TOO_MANY_ATTEMPTS", throttleMessage(throttle), {
      retryAfterSeconds: throttle.retryAfterSeconds,
    });
  }

  const user = await repo.findByEmail(input.email);
  if (!user) {
    await recordLoginAttempt(
      input.email,
      "login-failed",
      "Sign-in failed: no account with that email",
    );
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, user.password);
  if (!valid) {
    await recordLoginAttempt(
      input.email,
      "login-failed",
      "Sign-in failed: incorrect password",
      user.name,
    );
    throw new UnauthorizedError("Invalid email or password");
  }

  // Deactivated accounts (IT Designer's "deactivate accounts" scope) keep
  // their row and their history but can no longer obtain a token.
  if (!user.isActive) {
    await recordLoginAttempt(
      input.email,
      "login-failed",
      "Sign-in refused: account is deactivated",
      user.name,
    );
    throw new UnauthorizedError(
      "This account has been deactivated. Contact your system administrator.",
    );
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  // The JWT is stateless with a 30-day expiry, so "active session" is derived
  // from the most recent successful sign-in rather than a session table —
  // see audit-logs/repository.ts findRecentSessions.
  await recordLoginAttempt(
    input.email,
    "login",
    `Signed in as ${user.role}`,
    user.name,
  );

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
};

/**
 * Server-side sign-out: every token issued to this account before now stops working, on every
 * device. The calling instance drops its own cache entry so this takes effect at once; other
 * server instances catch up within the session cache TTL (middleware/auth.ts).
 */
export const logout = async (userId: number, email: string, name: string) => {
  await repo.revokeTokens(userId);
  invalidateSessionCache(userId);
  await recordLoginAttempt(email, "logout", "Signed out", name);
};

// ---------------------------------------------------------------------------
// Reset tokens
//
// A reset link carries a random 256-bit token. Only its SHA-256 is stored
// (password_reset_tokens), so a database leak yields no usable links. A token
// is bound to ONE user id — the account whose password it changes — expires
// after 30 minutes, and is single use: redeeming it, or issuing a newer one
// for the same account, marks it used.

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const buildResetUrl = (token: string) =>
  `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

const issueResetToken = async (userId: number, requestedByUserId: number) => {
  // Only the newest link should work.
  await repo.revokeOpenResetTokens(userId);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await repo.createResetToken({
    userId,
    tokenHash: hashToken(token),
    requestedByUserId,
    expiresAt,
  });
  return { token, expiresAt, url: buildResetUrl(token) };
};

const resetEmailBody = (opts: {
  greeting: string;
  explanation: string;
  url: string;
}) => ({
  text: `${opts.greeting}\n\n${opts.explanation}\n\n${opts.url}\n\nThis link expires in 30 minutes and can be used once. If you did not expect this email, ignore it — nothing changes until the link is used.`,
  html: `<p>${opts.greeting}</p><p>${opts.explanation}</p><p><a href="${opts.url}">Set a new password</a></p><p style="color:#666;font-size:12px">Or paste this link into your browser:<br>${opts.url}</p><p style="color:#666;font-size:12px">This link expires in 30 minutes and can be used once. If you did not expect this email, ignore it — nothing changes until the link is used.</p>`,
});

export const requestPasswordReset = async (input: ForgotPasswordInput) => {
  // Checked before the account lookup, so an unconfigured server fails the
  // same way for every address instead of revealing which ones exist.
  assertMailConfigured();

  const user = await repo.findByEmail(input.email);

  // Always report success. Telling an anonymous caller whether an address is
  // registered turns this endpoint into an account-enumeration oracle.
  if (!user || !user.isActive) return;

  const { url } = await issueResetToken(user.id, user.id);

  const body = resetEmailBody({
    greeting: `Hello ${user.name},`,
    explanation:
      "We received a request to reset the password for your EasyConstruct account. Use the link below to choose a new one.",
    url,
  });
  await sendMail({ to: user.email, subject: "Reset your EasyConstruct password", ...body });

  await logAudit({
    entityType: "user",
    entityId: String(user.id),
    action: "updated",
    actor: user.name,
    summary: `Requested a password reset link for ${user.email}`,
  });
};

export const resetPassword = async (input: ResetPasswordInput) => {
  const invalid = () => new ValidationError("This reset link is invalid or has expired");

  const record = await repo.findResetToken(hashToken(input.token));
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) throw invalid();

  const user = await repo.findById(record.userId);
  if (!user) throw invalid();

  // Consume the token first, atomically: two concurrent submissions of the
  // same link must not both succeed.
  const consumed = await repo.consumeResetToken(record.id);
  if (!consumed) throw invalid();

  await repo.updatePassword(
    user.id,
    await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS),
  );
  // Any other outstanding link for this account is now meaningless.
  await repo.revokeOpenResetTokens(user.id);
  // Sessions issued before this moment are rejected from here on
  // (middleware/auth.ts compares the token's iat with passwordChangedAt).
  invalidateSessionCache(user.id);

  const requestedBy =
    record.requestedByUserId && record.requestedByUserId !== user.id
      ? await repo.findById(record.requestedByUserId)
      : null;

  await logAudit({
    entityType: "user",
    entityId: String(user.id),
    action: "updated",
    actor: user.name,
    summary: requestedBy
      ? `Completed a password reset for ${user.email} (recovery requested by Owner ${requestedBy.email}); previous sessions were signed out`
      : `Completed a password reset for ${user.email}; previous sessions were signed out`,
  });
};

// ---------------------------------------------------------------------------
// Owner fail-safe account recovery
//
// Every other password-reset path assumes the account holder can still reach
// their own mailbox (self-service forgot-password) or that someone with
// account-management rights is doing the reset (IT Designer's admin reset —
// see users/service.ts setPassword). Neither works if the IT Designer's own
// account is the one that's locked out, since that role IS account
// management. Owner is the one role above IT Designer in practice, so it gets
// a narrow, one-directional escape hatch: recover the IT Designer account
// only, with the link emailed to the OWNER's own registered address (the one
// stored on the Owner account — never one supplied in the request, and never
// the IT Designer's, since that mailbox may be exactly what's unreachable).
//
// Completing it is the ordinary POST /api/auth/reset-password: the token is
// bound to the IT Designer's user id, so the new password lands on that
// account and not the Owner's.
const RECOVERABLE_ROLE = "it-designer";

export const initiateOwnerRecovery = async (
  ownerUserId: number,
  targetUserId: number,
): Promise<OwnerRecoveryResult> => {
  assertMailConfigured();

  const owner = await repo.findById(ownerUserId);
  if (!owner || owner.role !== "owner") throw new UnauthorizedError();

  const target = await repo.findById(targetUserId);
  if (!target) throw new NotFoundError("User", String(targetUserId));

  if (target.role !== RECOVERABLE_ROLE) {
    throw new ValidationError(
      "Fail-safe recovery can only be used to recover the IT Designer account.",
    );
  }

  const { url, expiresAt } = await issueResetToken(target.id, owner.id);

  // Audit the request before sending so a delivery failure is still on record.
  await logAudit({
    entityType: "user",
    entityId: String(target.id),
    action: "updated",
    actor: owner.name,
    summary: `Owner fail-safe recovery requested for IT Designer account ${target.email}; reset link emailed to ${owner.email}`,
  });

  const body = resetEmailBody({
    greeting: `Hello ${owner.name},`,
    explanation: `You requested recovery of the IT Designer account ${target.name} (${target.email}). Use the link below to set that account's new password.`,
    url,
  });
  try {
    await sendMail({
      to: owner.email,
      subject: `EasyConstruct: recover the IT Designer account (${target.name})`,
      ...body,
    });
  } catch (error) {
    await repo.revokeOpenResetTokens(target.id);
    await logAudit({
      entityType: "user",
      entityId: String(target.id),
      action: "updated",
      actor: owner.name,
      summary: `Owner fail-safe recovery email to ${owner.email} could not be delivered; link revoked`,
    });
    throw error;
  }

  return {
    to: owner.email,
    targetUserId: target.id,
    targetName: target.name,
    targetEmail: target.email,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  };
};
