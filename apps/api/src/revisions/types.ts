// apps/api/src/revisions/types.ts
import type { RevisionItemType, RevisionStatus } from "./rules.js";

/** A revision as the API returns it: strict unions, no raw storage URL (files are read via /download). */
export interface Revision {
  id: number;
  projectCode: string;
  architectId: number;
  createdBy: string;
  itemType: RevisionItemType;
  itemId: number;
  itemTitle: string;
  versionNumber: number;
  versionLabel: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadPath: string;
  changeSummary: string;
  status: RevisionStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  isCurrent: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface RevisionDetail extends Revision {
  previous: { id: number; versionNumber: number; versionLabel: string | null; status: RevisionStatus } | null;
}

export interface RevisionFilters {
  /** Projects the caller may see; undefined = unrestricted (admin). */
  projectCodes?: string[];
  project?: string;
  itemType?: RevisionItemType;
  itemId?: number;
  status?: RevisionStatus;
  architectId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  currentOnly?: boolean;
}

export interface CreateRevisionInput {
  projectCode: string;
  itemType: RevisionItemType;
  /** Existing record to version; omit with newItem to start tracking a new plan. */
  itemId?: number;
  newItem?: { title: string };
  versionLabel?: string;
  changeSummary: string;
  file: { url: string; fileName: string; fileSize: number; mimeType: string };
}

export interface RevisionActor {
  id: number;
  name: string;
  role: string;
}

export interface RevisionSummary {
  total: number;
  /** Current versions waiting to be picked up (Draft or Submitted). */
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
}
