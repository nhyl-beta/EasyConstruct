import * as repo from "./repository.js";
import * as designsRepo from "../repository.js";
import { NotFoundError } from "../../utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../../lifecycle/service.js";
import * as notificationsService from "../../notifications/service.js";
import type { CreateDesignReviewInput, DecideDesignReviewInput, DesignReviewFilters } from "./types.js";

// E1: the review's own decision vocabulary ("Changes Requested") isn't the
// design's own status vocabulary ("Revision Required", used everywhere else
// a design's own status is set/read, including gate D2) — this is the one
// place that translates between them.
const DESIGN_STATUS_BY_DECISION: Record<DecideDesignReviewInput["decision"], string> = {
  Approved: "Approved",
  Rejected: "Revision Required",
  "Changes Requested": "Revision Required",
};

export const getAll = async (filters: DesignReviewFilters) => repo.findAll(filters);
export const getById = async (id: number) => {
  const review = await repo.findById(id);
  if (!review) throw new NotFoundError('Design review', String(id));
  return review;
};

const refreshForDesign = async (designId: number) => {
  const design = await designsRepo.findById(designId);
  if (design) await refreshProjectProgress(design.projectCode);
};

const assertWritableForDesign = async (designId: number) => {
  const design = await designsRepo.findById(designId);
  if (design) await assertProjectWritable(design.projectCode);
};

export const create = async (input: CreateDesignReviewInput) => {
  await assertWritableForDesign(input.designId);
  const created = await repo.create(input);
  await refreshForDesign(input.designId);
  return created;
};
export const decide = async (input: DecideDesignReviewInput) => {
  const existing = await getById(input.id);
  await assertWritableForDesign(existing.designId);
  const updated = await repo.decide(input.id, input.decision);
  if (!updated) throw new NotFoundError('Design review', String(input.id));

  const design = await designsRepo.findById(existing.designId);
  if (design) {
    const nextStatus = DESIGN_STATUS_BY_DECISION[input.decision];
    await designsRepo.update(design.id, { status: nextStatus });
    // The architect who submitted the design for review had no way to learn
    // the outcome short of reopening it — same notify-on-decision pattern
    // used by milestones/service.ts and project-members/service.ts.
    await notificationsService.create({
      recipientRole: "architect",
      title: `Design review: ${input.decision}`,
      body: `"${design.name}" (${design.code}) was reviewed: ${input.decision}.`,
      link: `/designs/${design.id}`,
      projectCode: design.projectCode,
    });
  }

  await refreshForDesign(existing.designId);
  return updated;
};
export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError('Design review', String(id));
  await refreshForDesign(existing.designId);
  return deleted;
};