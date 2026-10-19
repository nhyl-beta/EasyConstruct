// RFI / RFA requests and transmittals (the client's J.D. Legaspi forms).

export const REQUEST_KINDS = ["RFI", "RFA"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const DISCIPLINES = ["AR", "ST", "EE", "ME", "PL", "CV", "ID"] as const;
export type RequestDiscipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABEL: Record<RequestDiscipline, string> = {
  AR: "Architectural",
  ST: "Structural",
  EE: "Electrical",
  ME: "Mechanical",
  PL: "Plumbing",
  CV: "Civil",
  ID: "Interior design",
};

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

/** Where a request goes: a staffed Architect/Consultant, or the project's client by email. */
export const RECIPIENT_TYPES = ["internal", "client"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const EMAIL_STATUSES = ["not_sent", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = { not_sent: "Not sent", sent: "Sent", failed: "Failed" };

/** Mirrors MAX_EMAIL_RESENDS on the server. */
export const MAX_EMAIL_RESENDS = 3;

export const RFA_OUTCOMES = ["approved", "approved_as_noted", "rejected"] as const;
export type RfaOutcome = (typeof RFA_OUTCOMES)[number];

export interface RequestFile {
  id: number;
  stage: "request" | "response";
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string | null;
}

export interface DesignRequest {
  id: number;
  kind: RequestKind;
  number: string;
  projectCode: string;
  discipline: RequestDiscipline;
  sequence: number;
  sheetNumbers: string | null;
  subject: string;
  sectionsReferenced: string | null;
  requestText: string;
  costImpact: Impact;
  costNote: string | null;
  timeImpact: Impact;
  timeDays: number | null;
  requestedByUserId: number | null;
  requestedByName: string;
  requestedByRole: string;
  countersignedByName: string | null;
  countersignedAt: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  recipientType: RecipientType;
  recipientEmail: string | null;
  emailStatus: EmailStatus;
  emailResendCount: number;
  clientRepliedAt: string | null;
  dueDate: string | null;
  sentAt: string | null;
  status: RequestStatus;
  responseText: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  returnedByName: string | null;
  returnedByPosition: string | null;
  returnedAt: string | null;
  followUpOfId: number | null;
  designId: number | null;
  createdAt: string | null;
  // derived by the server
  isOpen: boolean;
  isOverdue: boolean;
  suggestsChangeOrder: boolean;
}

/** One person a client request was emailed to (client demo changes #5 and #6). */
export interface RequestRecipient {
  id: number;
  stakeholderId: number | null;
  name: string;
  /** Only returned to the sender, the PM and the Admin. */
  email: string | null;
  emailStatus: EmailStatus;
  sentAt: string | null;
  resendCount: number;
  repliedAt: string | null;
  canResend: boolean;
  /** What they wrote through the reply link. */
  responseText?: string | null;
  responderName?: string | null;
  responderPosition?: string | null;
}

export interface DesignRequestDetail extends DesignRequest {
  recipients: RequestRecipient[];
  files: RequestFile[];
  followUps: DesignRequest[];
  followUpOf: { id: number; number: string } | null;
}

export interface RequestFilters {
  projectCode?: string;
  kind?: RequestKind | "all";
  status?: RequestStatus | "all";
  search?: string;
  box?: "raised" | "inbox";
  overdue?: boolean;
}

export interface UploadedRef {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateRequestInput {
  kind: RequestKind;
  projectCode: string;
  discipline: RequestDiscipline;
  sheetNumbers?: string;
  subject: string;
  sectionsReferenced?: string;
  requestText: string;
  costImpact: Impact;
  costNote?: string;
  timeImpact: Impact;
  timeDays?: number;
  /** Required unless recipientType is "client". */
  assignedToUserId?: number;
  recipientType: RecipientType;
  /** The project's stakeholders a client request goes to (one email each). Required when recipientType is "client" unless recipientEmail is given. */
  recipientStakeholderIds?: number[];
  /** The older single address, still accepted. */
  recipientEmail?: string;
  dueDays?: number;
  designId?: number;
  followUpOfId?: number;
  files?: UploadedRef[];
}

export interface Assignee {
  userId: number;
  name: string;
  role: string;
}

export interface AttentionData {
  overdueRequests: { id: number; number: string; subject: string; projectCode: string; assignedToName: string | null; dueDate: string | null; daysOverdue: number }[];
  unsentDrafts: { id: number; number: string; subject: string; projectCode: string; requestedByName: string; daysWaiting: number }[];
  stalledStages: { stageId: number; workflowId: number; workflowCode: string; title: string; projectCode: string; roleLabel: string; daysStalled: number }[];
  thresholds: { stalledHours: number; draftDays: number };
}

// ── Transmittals ───────────────────────────────────────────────────────────

export const TRANSMITTAL_PURPOSES: { value: string; label: string }[] = [
  { value: "for-document", label: "For document" },
  { value: "for-staff", label: "For staff" },
  { value: "for-information", label: "For information / dissemination" },
  { value: "for-comments", label: "For comments" },
  { value: "for-recommending-approval", label: "For recommending approval" },
  { value: "for-other-personnel", label: "For other personnel" },
  { value: "for-compliance", label: "For compliance / implementation" },
  { value: "for-review", label: "For review / evaluation" },
  { value: "for-approval", label: "For approval" },
  { value: "for-computation", label: "For computation" },
  { value: "plans-drawing", label: "Plans / drawing" },
  { value: "communication", label: "Communication" },
  { value: "specification", label: "Specification" },
  { value: "billing", label: "Billing" },
  { value: "others", label: "Others" },
];

export interface TransmittalItem {
  id: number;
  requestId: number | null;
  particulars: string;
  remarks: string | null;
  position: number;
}

export interface TransmittalAck {
  id: number;
  name: string;
  signature: string | null;
  office: string | null;
  acknowledgedAt: string | null;
}

export interface Transmittal {
  id: number;
  controlNo: string;
  projectCode: string;
  dateIssued: string;
  location: string | null;
  toName: string;
  thruName: string | null;
  type: "inter-office" | "inter-agency";
  subject: string;
  purposes: string[];
  purposeOther: string | null;
  transmittedByName: string;
  receivedByName: string | null;
  status: "draft" | "issued" | "acknowledged";
  items?: TransmittalItem[];
  acknowledgements?: TransmittalAck[];
}

export interface CreateTransmittalInput {
  projectCode: string;
  dateIssued?: string;
  location?: string;
  toName: string;
  thruName?: string;
  type: "inter-office" | "inter-agency";
  subject: string;
  purposes: string[];
  purposeOther?: string;
  receivedByName?: string;
  items: { requestId?: number; particulars: string; remarks?: string }[];
}
