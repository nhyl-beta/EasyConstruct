import { apiClient } from "@/services/api.client";
import {
  DISCIPLINES,
  IMPACTS,
  EMAIL_STATUSES,
  RECIPIENT_TYPES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  type Assignee,
  type AttentionData,
  type CreateRequestInput,
  type CreateTransmittalInput,
  type DesignRequest,
  type DesignRequestDetail,
  type EmailStatus,
  type Impact,
  type RecipientType,
  type RequestDiscipline,
  type RequestFilters,
  type RequestKind,
  type RequestStatus,
  type RfaOutcome,
  type Transmittal,
  type UploadedRef,
} from "../types/request.types";

// The API already returns the strict unions; these guard against a value an
// older or newer server might send so the UI never handles an arbitrary string.
const pick = <T extends string>(allowed: readonly T[], raw: unknown, fallback: T): T =>
  (allowed as readonly string[]).includes(String(raw)) ? (raw as T) : fallback;

/* eslint-disable @typescript-eslint/no-explicit-any */
const normalize = (r: any): DesignRequest => ({
  ...r,
  kind: pick<RequestKind>(REQUEST_KINDS, r.kind, "RFI"),
  discipline: pick<RequestDiscipline>(DISCIPLINES, r.discipline, "AR"),
  status: pick<RequestStatus>(REQUEST_STATUSES, r.status, "open"),
  costImpact: pick<Impact>(IMPACTS, r.costImpact, "none"),
  timeImpact: pick<Impact>(IMPACTS, r.timeImpact, "none"),
  // Rows from before the client path are internal requests that were never emailed.
  recipientType: pick<RecipientType>(RECIPIENT_TYPES, r.recipientType, "internal"),
  recipientEmail: r.recipientEmail ?? null,
  emailStatus: pick<EmailStatus>(EMAIL_STATUSES, r.emailStatus, "not_sent"),
  emailResendCount: Number(r.emailResendCount ?? 0),
  clientRepliedAt: r.clientRepliedAt ?? null,
  isOpen: !!r.isOpen,
  isOverdue: !!r.isOverdue,
  suggestsChangeOrder: !!r.suggestsChangeOrder,
});

const normalizeDetail = (r: any): DesignRequestDetail => ({
  ...normalize(r),
  recipients: (r.recipients ?? []).map((x: any) => ({
    ...x,
    emailStatus: pick<EmailStatus>(EMAIL_STATUSES, x.emailStatus, "not_sent"),
    resendCount: Number(x.resendCount ?? 0),
    canResend: !!x.canResend,
  })),
  files: r.files ?? [],
  followUps: (r.followUps ?? []).map(normalize),
  followUpOf: r.followUpOf ?? null,
});

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return (json as { data: T }).data;
  return json as T;
}

const query = (f: RequestFilters): string => {
  const p = new URLSearchParams();
  if (f.projectCode) p.set("projectCode", f.projectCode);
  if (f.kind && f.kind !== "all") p.set("kind", f.kind);
  if (f.status && f.status !== "all") p.set("status", f.status);
  if (f.search?.trim()) p.set("search", f.search.trim());
  if (f.box) p.set("box", f.box);
  if (f.overdue) p.set("overdue", "true");
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const RequestRepository = {
  async list(filters: RequestFilters = {}): Promise<DesignRequest[]> {
    return (await unwrap<any[]>(apiClient.get(`/design-requests${query(filters)}`))).map(normalize);
  },
  async get(id: number): Promise<DesignRequestDetail> {
    return normalizeDetail(await unwrap<any>(apiClient.get(`/design-requests/${id}`)));
  },
  async assignees(projectCode: string): Promise<Assignee[]> {
    return unwrap<Assignee[]>(apiClient.get(`/design-requests/assignees?projectCode=${encodeURIComponent(projectCode)}`));
  },
  async create(input: CreateRequestInput): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post("/design-requests", input)));
  },
  /** `overrideReason` is how an Admin sends in the PM's place (client demo change #9). */
  async send(id: number, dueDays?: number, overrideReason?: string): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/send`, { ...(dueDays ? { dueDays } : {}), ...(overrideReason ? { overrideReason } : {}) })));
  },
  async acknowledge(id: number): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/acknowledge`, {})));
  },
  async respond(id: number, input: { responseText: string; outcome?: RfaOutcome; files?: UploadedRef[] }): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/respond`, input)));
  },
  async close(id: number): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/close`, {})));
  },
  async followUp(id: number, input: { requestText: string; dueDays?: number; files?: UploadedRef[] }): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/follow-up`, input)));
  },
  async recordReturned(id: number, input: { returnedByName: string; returnedByPosition: string; returnedAt?: string }): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/returned`, input)));
  },
  /** Resend the email to one recipient, or (no recipientId) to everyone who has not replied. */
  async resendEmail(id: number, recipientId?: number): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.post(`/design-requests/${id}/resend-email`, recipientId ? { recipientId } : {})));
  },
  async markClientReplied(id: number): Promise<DesignRequest> {
    return normalize(await unwrap<any>(apiClient.patch(`/design-requests/${id}/client-replied`, {})));
  },
  async attention(): Promise<AttentionData> {
    return unwrap<AttentionData>(apiClient.get("/design-requests/attention"));
  },
};

export const TransmittalRepository = {
  async list(projectCode?: string): Promise<Transmittal[]> {
    return unwrap<Transmittal[]>(apiClient.get(`/transmittals${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ""}`));
  },
  async get(id: number): Promise<Transmittal> {
    return unwrap<Transmittal>(apiClient.get(`/transmittals/${id}`));
  },
  async create(input: CreateTransmittalInput): Promise<Transmittal> {
    return unwrap<Transmittal>(apiClient.post("/transmittals", input));
  },
  async issue(id: number): Promise<Transmittal> {
    return unwrap<Transmittal>(apiClient.post(`/transmittals/${id}/issue`, {}));
  },
  async acknowledge(id: number, ack: { name: string; signature?: string; office?: string }): Promise<Transmittal> {
    return unwrap<Transmittal>(apiClient.post(`/transmittals/${id}/acknowledgements`, ack));
  },
};
