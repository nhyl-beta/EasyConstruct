// A design that needs changes carries one of two words: "Revision Needed" (set by hand in the
// design form) or "Revision Required" (set when a review decides Rejected / Changes Requested).
// Cards, the status filter and the dashboard must count them as one group, or a design sent
// back by a review shows in the table but not in the "Revision needed" card.
export const REVISION_STATUSES = ["Revision Needed", "Revision Required"] as const;

export const statusesFor = (status: string): string[] =>
  (REVISION_STATUSES as readonly string[]).includes(status) ? [...REVISION_STATUSES] : [status];
