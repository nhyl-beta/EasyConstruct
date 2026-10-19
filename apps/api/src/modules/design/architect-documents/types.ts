// types.ts
export interface ArchitectDocumentRecord {
  id: number;
  designId: number | null;
  title: string;
  category: string;
  version: string;
  owner: string;
  fileType: string;
  sizeKb: number;
  status: string;
  updatedAt: Date | null;
}

export interface CreateArchitectDocumentInput {
  designId?: number;
  title: string;
  category: string;
  version?: string;
  owner: string;
  fileType?: string;
  sizeKb?: number;
  status?: string;
}

export interface UpdateArchitectDocumentInput extends Partial<CreateArchitectDocumentInput> {}

export interface ArchitectDocumentFilters {
  category?: string;
  search?: string;
}