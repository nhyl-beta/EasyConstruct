import * as repo from "./repository.js";
import * as designsRepo from "../repository.js";
import { NotFoundError, ValidationError } from "../../../../core/utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../../../projects/index.js";
import { notificationsService } from "../../../platform/index.js";
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

  await applyDecisionToDesign(existing.designId, input.decision);
  await refreshForDesign(existing.designId);
  return updated;
};

const applyDecisionToDesign = async (designId: number, decision: DecideDesignReviewInput["decision"]) => {
  const design = await designsRepo.findById(designId);
  if (!design) return;
  await designsRepo.update(design.id, { status: DESIGN_STATUS_BY_DECISION[decision] });
  // The architect who submitted the design for review had no way to learn
  // the outcome short of reopening it — same notify-on-decision pattern
  // used by milestones/service.ts and project-members/service.ts.
  await notificationsService.create({
    recipientRole: "architect",
    title: `Design review: ${decision}`,
    body: `"${design.name}" (${design.code}) was reviewed: ${decision}.`,
    link: `/designs/${design.id}`,
    projectCode: design.projectCode,
  });
};

/**
 * Decide a design straight from the Consultant's designs register. A design can
 * be "In Review" with no review row (status set by hand or seeded), so this
 * closes any open review for it and sets the design status in one step.
 */
export const decideForDesign = async (designId: number, decision: DecideDesignReviewInput["decision"]) => {
  const design = await designsRepo.findById(designId);
  if (!design) throw new NotFoundError("Design", String(designId));
  if (design.status !== "In Review" && design.status !== "Revision Required") {
    throw new ValidationError(`Only a design that is In Review can be reviewed (this one is ${design.status})`);
  }
  await assertProjectWritable(design.projectCode);
  for (const r of await repo.findAll({ designId })) {
    if (r.status === "Pending" || r.status === "Changes Requested") await repo.decide(r.id, decision);
  }
  await applyDecisionToDesign(designId, decision);
  await refreshForDesign(designId);
  return designsRepo.findById(designId);
};
export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError('Design review', String(id));
  await refreshForDesign(existing.designId);
  return deleted;
};