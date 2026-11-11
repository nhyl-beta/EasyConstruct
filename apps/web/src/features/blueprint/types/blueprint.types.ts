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
  fileUrl: string | null;
  thumbnail: string | null;
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
  discipline?: string;
  projectCode?: string;
  fileUrl?: string;
  thumbnail?: string;
  fileType?: string;
  sizeKb?: number;
}
