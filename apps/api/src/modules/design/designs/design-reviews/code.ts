/**
 * A design review's code (unique, 20 characters at most). It used to be "REV-<design code>-<time>" cut to
 * 20, and a design code like DSN-2026-7527 left room for 2 characters of the time, which repeats for weeks,
 * so a design's second review failed with "key already exists". The design is linked by designId, not by this code.
 */
export const newReviewCode = (): string =>
  `REV-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
