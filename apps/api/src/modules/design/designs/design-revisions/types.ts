// types.ts
export interface DesignRevisionRecord {
  id: number;
  designId: number;
  version: string;
  parentVersion: string | null;
  revisionNumber: number;
  reason: string | null;
  changeSummary: string | null;
  status: string;
  createdBy: string;
  createdAt: Date | null;
  approvedAt: Date | null;
  isDemo: boolean;
}

/** A revision with the design (and so the project) it belongs to. */
export interface DesignRevisionDetail extends DesignRevisionRecord {
  designCode: string;
  designName: string;
  discipline: string;
  projectCode: string;
}

export interface CreateDesignRevisionInput {
  designId: number;
  version: string;
  parentVersion?: string;
  revisionNumber?: number;
  reason?: string;
  changeSummary?: string;
  status?: string;
  createdBy: string;
  /** Only the demo generator sets this. */
  isDemo?: boolean;
  /** Only the demo generator sets this (backdated history). */
  createdAt?: Date;
  approvedAt?: Date;
}

export interface UpdateDesignRevisionInput extends Partial<CreateDesignRevisionInput> {
  approvedAt?: Date;
}

export interface DesignRevisionFilters {
  designId?: number;
  status?: string;
  projectCode?: string;
  /** Restrict to these project codes (caller's visibility); undefined = no restriction. */
  projectCodes?: ReadonlySet<string> | null;
}

export interface DesignRevisionSummary {
  total: number;
  designsWithRevisions: number;
  latestVersion: string | null;
  latestChangeAt: Date | null;
  awaitingApproval: number;
  byStatus: Record<string, number>;
}

export interface RevisionActor {
  id: number;
  name: string;
  role: string;
}
