// types.ts
export interface BlueprintRecord {
  id: number;
  drawingNumber: string;
  title: string;
  folder: string;
  discipline: string | null;
  scale: string | null;
  revision: string;
  author: string;
  approval: string;
  status: string;
  fileType: string;
  sizeKb: number;
  favorite: boolean;
  tags: string | null;
  projectCode: string | null;
  designId: number | null;
  issueDate: Date | null;
  latestRevisionDate: Date | null;
}

export interface CreateBlueprintInput {
  drawingNumber: string;
  title: string;
  folder: string;
  discipline?: string;
  scale?: string;
  revision?: string;
  author: string;
  approval?: string;
  status?: string;
  fileType?: string;
  sizeKb?: number;
  favorite?: boolean;
  tags?: string;
  projectCode?: string | null;
  designId?: number | null;
}

export interface UpdateBlueprintInput extends Partial<CreateBlueprintInput> {}

export interface DecideBlueprintInput {
  id: number;
  approval: "Approved" | "Rejected" | "Revision Required";
}

export interface BlueprintFilters {
  folder?: string;
  search?: string;
  projectCode?: string;
}