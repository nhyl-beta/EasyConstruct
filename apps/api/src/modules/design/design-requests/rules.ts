// apps/api/src/design-requests/rules.ts
//
// Pure rules for RFI/RFA requests and transmittals (no database): numbering,
// deadlines, "open"/"overdue", who may act. Unit-tested in rules.test.ts.

export const REQUEST_KINDS = ["RFI", "RFA"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** AR architectural, ST structural, EE electrical, ME mechanical, PL plumbing, CV civil, ID interior design. */
export const DISCIPLINES = ["AR", "ST", "EE", "ME", "PL", "CV", "ID"] as const;
export type RequestDiscipline = (typeof DISCIPLINES)[number];

export const IMPACTS = ["none", "increase", "decrease"] as const;
export type Impact = (typeof IMPACTS)[number];

export const REQUEST_STATUSES = [
  "draft",
  "open",
  "in_review",
  "client_replied",
  "answered",
  "approved",
  "approved_as_noted",
  "rejected",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** RFA outcomes the responder can choose (they become the request's status). */
export const RFA_OUTCOMES = ["approved", "approved_as_noted", "rejected"] as const;
export type RfaOutcome = (typeof RFA_OUTCOMES)[number];

/** Default response windows, in days from sending. Editable per request. */
export const DEFAULT_DUE_DAYS: Record<RequestKind, number> = { RFI: 3, RFA: 4 };

/** Statuses that count as "finished" — anything else (including draft) is open for the closing gates. */
const FINISHED: ReadonlySet<string> = new Set(["answered", "approved", "approved_as_noted", "rejected", "closed"]);
/** Statuses where a response is still awaited (the clock is running). */
const AWAITING_RESPONSE: ReadonlySet<string> = new Set(["open", "in_review"]);

/** Where an RFI/RFA goes: a staffed Architect/Consultant, or the project's client by email. */
export const RECIPIENT_TYPES = ["internal", "client"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];
export const EMAIL_STATUSES = ["not_sent", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** A request can be re-emailed at most this many times. */
export const MAX_EMAIL_RESENDS = 3;
/** Client RFIs a sender can still act on (mark replied / answer): the clock is running or the client has replied. */
export const CLIENT_ACTIVE_STATUSES: ReadonlySet<string> = new Set(["open", "client_replied"]);

/** Gate definition of "open": not answered, approved, approved-as-noted, rejected or closed. */
export const isOpenRequest = (status: string): boolean => !FINISHED.has(status);

export const isAwaitingResponse = (status: string): boolean => AWAITING_RESPONSE.has(status);

/** Overdue is derived, never stored: due date passed while a response is still awaited. */
export const isOverdue = (req: { status: string; dueDate: Date | null }, now: Date = new Date()): boolean =>
  !!req.dueDate && isAwaitingResponse(req.status) && now.getTime() > req.dueDate.getTime();

const pad = (n: number, width: number) => String(n).padStart(width, "0");
const yy = (d: Date) => pad(d.getFullYear() % 100, 2);

/** Letters, digits and hyphens only, upper-cased: "Zh 01" -> "ZH01". */
export const codeToken = (projectCode: string): string => projectCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");

/** `RFI-PCMC-AR-005-22` — {KIND}-{PROJECTCODE}-{DISC}-{SEQ:3}-{YY}. */
export const formatRequestNumber = (
  kind: RequestKind,
  projectCode: string,
  discipline: RequestDiscipline,
  sequence: number,
  date: Date,
): string => `${kind}-${codeToken(projectCode)}-${discipline}-${pad(sequence, 3)}-${yy(date)}`;

/** `PCMC-DOC-01-22` — {PROJECTCODE}-DOC-{SEQ:2}-{YY}. */
export const formatControlNo = (projectCode: string, sequence: number, date: Date): string =>
  `${codeToken(projectCode)}-DOC-${pad(sequence, 2)}-${yy(date)}`;

/** Due date for a request sent at `from`, with an optional custom window in days. */
export const computeDueDate = (kind: RequestKind, from: Date, days?: number | null): Date => {
  const window = days != null && days > 0 ? days : DEFAULT_DUE_DAYS[kind];
  return new Date(from.getTime() + window * 24 * 60 * 60 * 1000);
};

export const REQUESTER_ROLES = ["project-manager", "engineer"] as const;
export const RESPONDER_ROLES = ["architect", "consultant"] as const;

export const canRaise = (role: string): boolean => role === "admin" || (REQUESTER_ROLES as readonly string[]).includes(role);
/** An engineer's draft needs the PM to send it; a PM's (or Admin's) own request is auto-countersigned. */
export const needsCountersign = (role: string): boolean => role === "engineer";
export const isEligibleAssigneeRole = (role: string): boolean => (RESPONDER_ROLES as readonly string[]).includes(role);

/** The status a response puts the request in. */
export const statusAfterResponse = (kind: RequestKind, outcome: RfaOutcome | undefined): RequestStatus => {
  if (kind === "RFI") return "answered";
  if (!outcome) throw new Error("An RFA response needs an outcome");
  return outcome;
};

/** Cost/time impact means the request may need a change order. */
export const impliesChangeOrder = (req: { costImpact: string; timeImpact: string }): boolean =>
  req.costImpact !== "none" || req.timeImpact !== "none";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  open: "Open",
  in_review: "In review",
  client_replied: "Client replied",
  answered: "Answered",
  approved: "Approved",
  approved_as_noted: "Approved as noted",
  rejected: "Rejected",
  closed: "Closed",
};
