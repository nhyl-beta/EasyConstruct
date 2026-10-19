// apps/api/src/issues/types.ts — NEW
export interface IssueRecord {
  id: number;
  issueCode: string;
  projectCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  siteContext: string | null;
  attachmentUrl: string | null;
  reportedByUserId: number | null;
  reportedByName: string;
  reportedByRole: string;
  resolutionNotes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateIssueInput {
  issueCode: string;
  projectCode: string;
  title: string;
  description: string;
  category?: string;
  severity?: string;
  siteContext?: string;
  attachmentUrl?: string;
  reportedByUserId: number;
  reportedByName: string;
  reportedByRole: string;
}

export interface IssueFilters {
  /** Restrict to these project codes (visibility scope; set by the controller). */
  codes?: string[];
  projectCode?: string;
  status?: string;
  reportedByUserId?: number;
}