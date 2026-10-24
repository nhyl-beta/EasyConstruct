// The milestone date rule, shared by the New Project wizard and the project's
// Milestones panel. Mirrors apps/api/src/modules/projects/milestones/validators.ts,
// which stays the authority: a milestone's estimated date is today (Manila) or
// later.
export const MILESTONE_DATE_PAST_MESSAGE = "Milestone date can't be in the past";

/** Today as yyyy-MM-dd in Manila — the same day the server uses. */
export const todayManilaIso = (now: Date = new Date()): string =>
  now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** Error text for a milestone date, or null when it is empty or acceptable. */
export const milestoneDateError = (date: string, today: string = todayManilaIso()): string | null =>
  date && date < today ? MILESTONE_DATE_PAST_MESSAGE : null;

/**
 * Error for editing an existing milestone: only a date that is changing to a
 * past value is refused, so a milestone whose stored date has passed can still
 * be renamed or completed.
 */
export const milestoneRedateError = (
  next: string,
  stored: string | null | undefined,
  today: string = todayManilaIso(),
): string | null => (next === (stored ?? "") ? null : milestoneDateError(next, today));
