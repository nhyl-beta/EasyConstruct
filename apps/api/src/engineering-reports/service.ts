import * as repo from "./repository.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import { engineeringReports as engineeringReportsTable } from "../db/schema/engineering-reports.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import { refreshProjectProgress } from "../lifecycle/service.js";
import * as projectsRepo from "../projects/repository.js";
import { resolveProjectCode } from "./project-code.js";
import type {
  CreateEngineeringReportInput,
  UpdateEngineeringReportInput,
  EngineeringReportFilters,
} from "./types.js";

// A report's own author (engineer) can edit its content while it's still
// theirs to write, but deciding it — Approved, Rejected or sent back for
// Revision — is a PM/admin call; otherwise an engineer could self-approve
// the report the moment they filed it.
const DECISION_STATUSES = new Set(["Approved", "Rejected", "Revision Required"]);

const assertCanSetStatus = (status: string | undefined, actorRole: string) => {
  if (!status || !DECISION_STATUSES.has(status)) return;
  if (actorRole === "admin" || actorRole === "project-manager") return;
  throw new ForbiddenError(
    `Role '${actorRole}' cannot set an engineering report to '${status}'; only the Project Manager or Admin can decide it`,
  );
};

export const getAll = async (filters: EngineeringReportFilters) => {
  return await repo.findAll(filters);
};

export const typeStatusCounts = (filters: EngineeringReportFilters) => repo.typeStatusCounts(filters);

export const getPage = async (filters: EngineeringReportFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.REPORT_SORT_COLUMNS, repo.defaultReportOrder, engineeringReportsTable.id)),
  );

export const getById = async (id: number) => {
  const report = await repo.findById(id);
  if (!report) throw new NotFoundError("Engineering report", String(id));
  return report;
};

// The report must carry a project's stored code, or the PM (whose list is scoped
// by project) and gate X1 would never see it.
const requireStoredProjectCode = async (project: string): Promise<string> => {
  const candidates = await projectsRepo.findAll({ search: project.trim() });
  const resolved = resolveProjectCode(project, candidates.map((p) => p.code));
  if (!resolved) throw new ValidationError(`No project found with code "${project}"`);
  return resolved;
};

export const create = async (input: CreateEngineeringReportInput) => {
  input = { ...input, project: await requireStoredProjectCode(input.project) };
  const reportId =
    input.reportId ??
    `SR-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const created = await repo.create({ status: "Submitted", ...input, reportId });
  if (created) await refreshProjectProgress(created.project);
  return created;
};

export const update = async (
  id: number,
  input: UpdateEngineeringReportInput,
  actorRole: string,
) => {
  await getById(id);
  assertCanSetStatus(input.status, actorRole);
  if (input.project) input = { ...input, project: await requireStoredProjectCode(input.project) };
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError("Engineering report", String(id));
  // Gate X1 reads type='Final Inspection' + status='Approved'.
  await refreshProjectProgress(updated.project);
  return updated;
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Engineering report", String(id));
  await refreshProjectProgress(existing.project);
  return deleted;
};