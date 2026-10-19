// types/blueprint.types.ts
export interface Blueprint {
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
  issueDate: string | null;
  latestRevisionDate: string | null;
}

export interface CreateBlueprintInput {
  drawingNumber: string;
  title: string;
  folder: string;
  author: string;
  discipline?: string;
  projectCode?: string;
  approval?: string;
  status?: string;
}
