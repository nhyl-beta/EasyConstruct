// apps/api/src/documents/types.ts — NEW
export interface DocumentRecord {
  id: number;
  documentId: string;
  title: string;
  project: string;
  type: string;
  version: string;
  size: string | null;
  uploadedBy: string;
  fileUrl: string | null;
  stage: string | null;
  relatedType: string | null;
  relatedId: number | null;
  reportPeriod: string | null;
  periodDate: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateDocumentInput {
  documentId: string;
  title: string;
  project: string;
  type: string;
  version?: string;
  size?: string;
  uploadedBy: string;
  fileUrl?: string;
  stage?: string;
  relatedType?: string;
  relatedId?: number;
  /** daily | weekly | monthly, with periodDate: set for a Daily / Weekly / Monthly Report. */
  reportPeriod?: string;
  periodDate?: string;
}

export interface UploadDocumentInput {
  file: Express.Multer.File;
  title: string;
  project: string;
  type: string;
  version?: string;
  uploadedBy: string;
  stage?: string;
  relatedType?: string;
  relatedId?: number | string;
  reportPeriod?: string;
  periodDate?: string;
}

export interface DocumentFilters {
  project?: string;
  type?: string;
  projectCodes?: string[];
  stage?: string;
  /** Title / document id contains this text (paged lists only). */
  search?: string;
}