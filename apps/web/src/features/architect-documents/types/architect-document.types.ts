// types/architect-document.types.ts
export interface ArchitectDocument {
  id: number;
  designId: number | null;
  title: string;
  category: string;
  version: string;
  owner: string;
  fileType: string;
  sizeKb: number;
  status: string;
  updatedAt: string | null;
}