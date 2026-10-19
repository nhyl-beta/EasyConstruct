export type SortOrder = "asc" | "desc";

export interface QueryParams {
  limit?: string;
  current?: string;
  sort?: string;
  order?: SortOrder;
  search?: string;
}
