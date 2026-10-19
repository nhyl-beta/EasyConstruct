import { apiClient } from "@/services/api.client";
import {
  REVISION_ITEM_TYPES,
  REVISION_STATUSES,
  type CreateRevisionInput,
  type Revision,
  type RevisionComparison,
  type RevisionDetail,
  type RevisionFilters,
  type RevisionItemType,
  type RevisionPage,
  type RevisionStatus,
  type RevisionSummary,
} from "../types/revision.types";

// The API already returns the strict unions; these guard against a value the
// client does not know (an older or newer server) so the UI never has to
// handle an arbitrary string.
const normalizeStatus = (raw: string): RevisionStatus =>
  (REVISION_STATUSES as readonly string[]).includes(raw) ? (raw as RevisionStatus) : "Submitted";
const normalizeItemType = (raw: string): RevisionItemType =>
  (REVISION_ITEM_TYPES as readonly string[]).includes(raw) ? (raw as RevisionItemType) : "document";

interface BackendRevision extends Omit<Revision, "status" | "itemType"> {
  status: string;
  itemType: string;
}

const normalizeRevision = (raw: BackendRevision): Revision => ({
  ...raw,
  status: normalizeStatus(raw.status),
  itemType: normalizeItemType(raw.itemType),
});

const normalizeDetail = (raw: BackendRevision & { previous: (Omit<NonNullable<RevisionDetail["previous"]>, "status"> & { status: string }) | null }): RevisionDetail => ({
  ...normalizeRevision(raw),
  previous: raw.previous ? { ...raw.previous, status: normalizeStatus(raw.previous.status) } : null,
});

async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return (json as { data: T }).data;
  return json as T;
}

function toQuery(filters: RevisionFilters, page?: { page: number; pageSize: number }): string {
  const p = new URLSearchParams();
  if (page) {
    p.set("page", String(page.page));
    p.set("pageSize", String(page.pageSize));
  }
  if (filters.search) p.set("search", filters.search);
  if (filters.project) p.set("project", filters.project);
  if (filters.itemType) p.set("itemType", filters.itemType);
  if (filters.itemId != null) p.set("itemId", String(filters.itemId));
  if (filters.status) p.set("status", filters.status);
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) p.set("dateTo", filters.dateTo);
  if (filters.currentOnly) p.set("currentOnly", "1");
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export const RevisionRepository = {
  async list(filters: RevisionFilters, page: { page: number; pageSize: number }): Promise<RevisionPage> {
    const json = (await apiClient.get(`/revisions${toQuery(filters, page)}`)) as {
      data: BackendRevision[];
      meta: Omit<RevisionPage, "items">;
    };
    return { items: json.data.map(normalizeRevision), ...json.meta };
  },

  async summary(): Promise<RevisionSummary> {
    return unwrap<RevisionSummary>(apiClient.get("/revisions/summary"));
  },

  async getById(id: number): Promise<RevisionDetail> {
    return normalizeDetail(await unwrap(apiClient.get(`/revisions/${id}`)));
  },

  /** Every version of one item, newest first. */
  async history(itemType: RevisionItemType, itemId: number): Promise<Revision[]> {
    const raw = await unwrap<BackendRevision[]>(apiClient.get(`/revisions/by-item/${itemType}/${itemId}`));
    return raw.map(normalizeRevision);
  },

  async compare(leftId: number, rightId: number): Promise<RevisionComparison> {
    const raw = await unwrap<{ left: Parameters<typeof normalizeDetail>[0]; right: Parameters<typeof normalizeDetail>[0]; diff: RevisionComparison["diff"] }>(
      apiClient.get(`/revisions/compare?left=${leftId}&right=${rightId}`),
    );
    return { left: normalizeDetail(raw.left), right: normalizeDetail(raw.right), diff: raw.diff };
  },

  async create(input: CreateRevisionInput): Promise<Revision> {
    return normalizeRevision(await unwrap<BackendRevision>(apiClient.post("/revisions", input)));
  },

  async setStatus(id: number, status: RevisionStatus, comment?: string): Promise<Revision> {
    return normalizeRevision(
      await unwrap<BackendRevision>(apiClient.patch(`/revisions/${id}/status`, { status, ...(comment ? { comment } : {}) })),
    );
  },

  /** The file as a Blob (authenticated; the server checks project access). */
  async file(downloadPath: string): Promise<Blob> {
    return apiClient.getBlob(downloadPath);
  },
};
