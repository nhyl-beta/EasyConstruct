// types/design-revision.types.ts
export interface DesignRevision {
  id: number;
  designId: number;
  version: string;
  parentVersion: string | null;
  revisionNumber: number;
  reason: string | null;
  changeSummary: string | null;
  status: string;
  createdBy: string;
  createdAt: string | null;
  approvedAt: string | null;
  isDemo?: boolean;
}

/** A design revision together with the design (and project) it belongs to. */
export interface ProjectRevision extends DesignRevision {
  designCode: string;
  designName: string;
  discipline: string;
  projectCode: string;
  isDemo: boolean;
}

export interface ProjectRevisionSummary {
  total: number;
  designsWithRevisions: number;
  latestVersion: string | null;
  latestChangeAt: string | null;
  awaitingApproval: number;
  byStatus: Record<string, number>;
  /** False when the API refuses demo generation (production without ALLOW_DEMO_SEED). */
  demoAllowed: boolean;
}

export interface DemoGenerationResult {
  projectCode: string;
  created: number;
  designsCreated: number;
  skipped?: string;
}
