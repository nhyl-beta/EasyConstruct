// apps/api/src/lifecycle/approval-authority.ts: pure, no I/O (client demo change #9)
//
// Who may approve or reject a material/spec requirement and who may send an RFI/RFA: the project's own PM.
// An Admin keeps read access and an override that needs a written reason of at least 10 characters, which the
// caller records in the audit trail (the same pattern as the lifecycle Advance override).
import { AppError, ForbiddenError } from "../utils/errors.js";

export const MIN_OVERRIDE_REASON = 10;

export type Authority = { override: false } | { override: true; reason: string };

/** True when `reason` is long enough to count as a written reason. */
export const isValidOverrideReason = (reason: string | null | undefined): reason is string => (reason?.trim().length ?? 0) >= MIN_OVERRIDE_REASON;

/**
 * Decides whether the actor may take an action that belongs to the project's PM.
 *  - the project's own PM: allowed;
 *  - another PM: refused (it is not their project);
 *  - Admin: allowed only as an override with a written reason of at least 10 characters;
 *  - anyone else: refused.
 */
export const decideAuthority = (input: { role: string; isProjectPm: boolean; overrideReason?: string | null; action: string }): Authority => {
  const { role, isProjectPm, overrideReason, action } = input;
  if (role === "project-manager") {
    if (isProjectPm) return { override: false };
    throw new ForbiddenError(`Only this project's Project Manager can ${action}`);
  }
  if (role === "admin") {
    if (isValidOverrideReason(overrideReason)) return { override: true, reason: overrideReason.trim() };
    throw new AppError(
      403,
      "OVERRIDE_REASON_REQUIRED",
      `The Project Manager ${action}. As Admin you can override this only with a written reason of at least ${MIN_OVERRIDE_REASON} characters.`,
    );
  }
  throw new ForbiddenError(`Role '${role}' cannot ${action}; only the project's Project Manager can`);
};

/** The audit line for an Admin override. */
export const overrideSummary = (what: string, reason: string): string => `Admin override: ${what}. Reason: ${reason}`;
