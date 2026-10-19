import * as repo from "./repository.js";
import { documents as documentsTable } from "../core/db/schema/documents.js";
import { orderByFor, paginate, type PageRequest } from "../core/utils/pagination.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import { deleteStoredFile } from "../uploads/service.js";
import { NotFoundError } from "../core/utils/errors.js";
import { resolveForNewDocument } from "../reference/document-types/service.js";
import { resolveReportFields } from "../reports/filing.js";
import { assertAdvisoryHasFile, resolveRelatedItem, type RelatedInput } from "./advisory.js";

import type {
  CreateDocumentInput,
  DocumentFilters,
} from "./types.js";

export const getAll = async (
  filters: DocumentFilters,
) => {
  return repo.findAll(filters);
};

export const typeCounts = (filters: DocumentFilters) => repo.typeCounts(filters);

export const getPage = async (filters: DocumentFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.DOCUMENT_SORT_COLUMNS, repo.defaultDocumentOrder, documentsTable.id)),
  );

export const findProjectCodesForPm = async (pmName: string) => {
  return repo.findProjectCodesForPm(pmName);
};

export const create = async (
  input: CreateDocumentInput,
  actorRole?: string,
) => {
  assertAdvisoryHasFile(actorRole, !!input.fileUrl?.trim());
  await assertProjectWritable(input.project);
  const type = await resolveForNewDocument(input.type);
  const related = await resolveRelatedItem(input.project, input, repo.findRelatedItem);
  const report = resolveReportFields(type, input.reportPeriod, input.periodDate);
  const created = await repo.create({ ...input, type, ...related, ...report });
  // Several gate checks read document type (P5's Notice of Award/Contract,
  // C5's Notice to Proceed, X2's Certificate of Completion).
  if (created) await refreshProjectProgress(created.project);
  return created;
};

/**
 * Hard delete: the row and its stored file are removed. The audit log (written
 * by the controller) is what keeps the record of who removed what and when —
 * a soft-deleted row would also keep the file itself readable, which is the
 * opposite of what removing an uploaded document is for.
 */
export const remove = async (id: number) => {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Document", String(id));
  await assertProjectWritable(existing.project);
  const deleted = await repo.remove(id);
  if (existing.fileUrl) await deleteStoredFile(existing.fileUrl);
  // Gate checks read document type (P5, C5, X2), so progress can change.
  await refreshProjectProgress(existing.project);
  return deleted;
};

export const upload = async ({
  file,
  title,
  project,
  type,
  version,
  uploadedBy,
  stage,
  relatedType,
  relatedId,
  reportPeriod,
  periodDate,
}: {
  file: Express.Multer.File;
  title: string;
  project: string;
  type: string;
  version?: string;
  uploadedBy: string;
  stage?: string;
  reportPeriod?: string;
  periodDate?: string;
} & RelatedInput) => {
  await assertProjectWritable(project);
  type = await resolveForNewDocument(type);
  const related = await resolveRelatedItem(project, { relatedType, relatedId }, repo.findRelatedItem);

  const documentId =
    `ADV-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

  const fileUrl =
    `/uploads/documents/${file.filename}`;

  const sizeInMb =
    file.size / (1024 * 1024);

  const size =
    sizeInMb >= 1
      ? `${sizeInMb.toFixed(2)} MB`
      : `${Math.max(
          1,
          Math.round(file.size / 1024),
        )} KB`;

  const created = await repo.create({
    documentId,
    title,
    project,
    type,
    version: version ?? "v1",
    size,
    uploadedBy,
    fileUrl,
    stage,
    ...related,
    ...resolveReportFields(type, reportPeriod, periodDate),
  });
  await refreshProjectProgress(project);
  return created;
};