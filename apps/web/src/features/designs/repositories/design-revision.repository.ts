import { apiClient } from "@/services/api.client";
import type {
  DemoGenerationResult,
  ProjectRevision,
  ProjectRevisionSummary,
} from "../types/design-revision.types";

// The backend stores status as free text; fold case/whitespace variants onto
// the labels StatusBadge knows so a stray "under review" doesn't render grey.
const KNOWN_STATUSES = ["Draft", "Under Review", "Approved", "Rejected", "Submitted", "Superseded"];
const normalizeStatus = (raw: string | null | undefined): string => {
  const text = (raw ?? "").trim();
  return KNOWN_STATUSES.find((s) => s.toLowerCase() === text.toLowerCase()) ?? (text || "Draft");
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const normalizeRevision = (r: any): ProjectRevision => ({
  id: r.id,
  designId: r.designId,
  version: r.version,
  parentVersion: r.parentVersion ?? null,
  revisionNumber: r.revisionNumber ?? 1,
  reason: r.reason ?? null,
  changeSummary: r.changeSummary ?? null,
  status: normalizeStatus(r.status),
  createdBy: r.createdBy ?? "—",
  createdAt: iso(r.createdAt),
  approvedAt: iso(r.approvedAt),
  isDemo: !!r.isDemo,
  designCode: r.designCode ?? `Design #${r.designId}`,
  designName: r.designName ?? r.designCode ?? `Design #${r.designId}`,
  discipline: r.discipline ?? "",
  projectCode: r.projectCode ?? "",
});

const normalizeSummary = (m: any): ProjectRevisionSummary => ({
  total: m?.total ?? 0,
  designsWithRevisions: m?.designsWithRevisions ?? 0,
  latestVersion: m?.latestVersion ?? null,
  latestChangeAt: iso(m?.latestChangeAt),
  awaitingApproval: m?.awaitingApproval ?? 0,
  byStatus: m?.byStatus ?? {},
  demoAllowed: m?.demoAllowed !== false,
});

export const DesignRevisionRepository = {
  /** Every revision the caller may see, newest first (Architect-wide listing). */
  async list(): Promise<ProjectRevision[]> {
    const json = await apiClient.get("/design-revisions");
    return ((json?.data ?? []) as any[]).map(normalizeRevision);
  },

  /** Revisions of one project plus the server-computed summary. */
  async listByProject(projectCode: string): Promise<{ revisions: ProjectRevision[]; summary: ProjectRevisionSummary }> {
    const json = await apiClient.get(`/design-revisions?projectCode=${encodeURIComponent(projectCode)}`);
    return {
      revisions: ((json?.data ?? []) as any[]).map(normalizeRevision),
      summary: normalizeSummary(json?.meta),
    };
  },

  /** Admin-only, explicit; the server refuses it in production unless ALLOW_DEMO_SEED=true. */
  async generateDemo(projectCode: string): Promise<DemoGenerationResult> {
    const json = await apiClient.post(`/design-revisions/demo?projectCode=${encodeURIComponent(projectCode)}`, {});
    return json?.data as DemoGenerationResult;
  },
};
