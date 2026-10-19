export const REVISION_ITEM_TYPES = ["design", "plan", "document", "blueprint"] as const;
export type RevisionItemType = (typeof REVISION_ITEM_TYPES)[number];

export const REVISION_STATUSES = ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Superseded"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const ITEM_TYPE_LABEL: Record<RevisionItemType, string> = {
  design: "Design",
  plan: "Plan",
  document: "Document",
  blueprint: "Blueprint",
};

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
  /** API path (relative to /api) that streams the file after an access check. */
  downloadPath: string;
  changeSummary: string;
  status: RevisionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  isCurrent: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RevisionDetail extends Revision {
  previous: { id: number; versionNumber: number; versionLabel: string | null; status: RevisionStatus } | null;
}

export interface RevisionFilters {
  search?: string;
  project?: string;
  itemType?: RevisionItemType;
  itemId?: number;
  status?: RevisionStatus;
  dateFrom?: string;
  dateTo?: string;
  currentOnly?: boolean;
}

export interface RevisionPage {
  items: Revision[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface RevisionSummary {
  total: number;
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
}

export interface RevisionComparison {
  left: RevisionDetail;
  right: RevisionDetail;
  diff: {
    versionGap: number;
    fileSizeDelta: number;
    sameFileName: boolean;
    sameFileType: boolean;
    statusChanged: boolean;
    summaryChanged: boolean;
    authorChanged: boolean;
    daysBetween: number | null;
  };
}

export interface CreateRevisionInput {
  projectCode: string;
  itemType: RevisionItemType;
  itemId?: number;
  /** Start tracking a new plan instead of versioning an existing record. */
  newItem?: { title: string };
  versionLabel?: string;
  changeSummary: string;
  file: { url: string; fileName: string; fileSize: number; mimeType: string };
}
