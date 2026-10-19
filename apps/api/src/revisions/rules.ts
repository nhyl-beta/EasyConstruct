// apps/api/src/revisions/rules.ts
//
// The pure rules of revision management: status vocabulary, who may move a
// revision to which status, version numbering and what happens to the previous
// current version when a new one is uploaded. No I/O, so each rule is tested
// directly.
import { ForbiddenError, ValidationError } from "../core/utils/errors.js";
import {
  REVISION_ITEM_TYPES,
  REVISION_STATUSES,
  type RevisionItemType,
  type RevisionStatus,
} from "../core/db/schema/revisions.js";

export { REVISION_ITEM_TYPES, REVISION_STATUSES };
export type { RevisionItemType, RevisionStatus };

/** Free text from the database -> the strict union (unknown values read as "Submitted"). */
export const normalizeStatus = (raw: string | null | undefined): RevisionStatus =>
  (REVISION_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as RevisionStatus) : "Submitted";

export const normalizeItemType = (raw: string): RevisionItemType => {
  if ((REVISION_ITEM_TYPES as readonly string[]).includes(raw)) return raw as RevisionItemType;
  throw new ValidationError(`Item type must be one of: ${REVISION_ITEM_TYPES.join(", ")}`);
};

/** The next version number for an item: one past the highest recorded (1 for a new item). */
export const nextVersionNumber = (existing: number[]): number =>
  existing.length === 0 ? 1 : Math.max(...existing) + 1;

/**
 * What the previous current version becomes when a new one arrives. A decided
 * version (Approved / Rejected) keeps its status — only is_current moves — and
 * anything still open becomes Superseded.
 */
export const statusWhenSuperseded = (status: RevisionStatus): RevisionStatus =>
  status === "Approved" || status === "Rejected" ? status : "Superseded";

const REVIEWER_ROLES = new Set(["consultant", "project-manager", "admin"]);
const AUTHOR_ROLES = new Set(["architect", "admin"]);

// from -> allowed targets, per actor kind. Approved, Rejected and Superseded
// are final: a decision is never reopened (upload a new version instead).
const REVIEW_TRANSITIONS: Record<RevisionStatus, RevisionStatus[]> = {
  Draft: [],
  Submitted: ["Under Review", "Approved", "Rejected"],
  "Under Review": ["Approved", "Rejected"],
  Approved: [],
  Rejected: [],
  Superseded: [],
};
const AUTHOR_TRANSITIONS: Record<RevisionStatus, RevisionStatus[]> = {
  Draft: ["Submitted"],
  Submitted: [],
  "Under Review": [],
  Approved: [],
  Rejected: [],
  Superseded: [],
};

export const allowedNextStatuses = (from: RevisionStatus, role: string): RevisionStatus[] => [
  ...(REVIEWER_ROLES.has(role) ? REVIEW_TRANSITIONS[from] : []),
  ...(AUTHOR_ROLES.has(role) ? AUTHOR_TRANSITIONS[from] : []),
];

export const assertTransition = (
  from: RevisionStatus,
  to: RevisionStatus,
  role: string,
  comment: string | undefined,
): void => {
  if (!REVIEWER_ROLES.has(role) && !AUTHOR_ROLES.has(role)) {
    throw new ForbiddenError(`Role '${role}' cannot change a revision's status`);
  }
  if (!allowedNextStatuses(from, role).includes(to)) {
    throw new ValidationError(
      from === to
        ? `The revision is already '${from}'`
        : `A '${from}' revision cannot be moved to '${to}' by a ${role}`,
    );
  }
  if (to === "Rejected" && !comment?.trim()) {
    throw new ValidationError("A rejection needs a review comment explaining why");
  }
};

/** Roles that may read revisions at all (each is further limited to its own projects). */
export const REVISION_READ_ROLES = ["architect", "admin", "project-manager", "consultant"] as const;
export const REVISION_WRITE_ROLES = ["architect", "admin"] as const;
