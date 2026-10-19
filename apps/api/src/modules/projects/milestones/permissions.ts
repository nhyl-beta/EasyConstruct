// apps/api/src/milestones/permissions.ts
//
// Pure rule for the one milestone write an Engineer is allowed: marking an
// active or at-risk milestone completed, on a project they are staffed on as
// an engineer. Everything else about milestones stays with the PM/admin.
import { ForbiddenError } from "../../../core/utils/errors.js";
import type { UpdateMilestoneInput } from "./types.js";

const ENGINEER_COMPLETABLE_FROM = new Set(["active", "at-risk"]);

export const assertEngineerMayUpdate = (
  input: UpdateMilestoneInput,
  existingStatus: string,
  isStaffedEngineer: boolean,
): void => {
  const touched = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  if (touched.some((k) => k !== "status") || input.status !== "completed") {
    throw new ForbiddenError("Engineers can only mark a milestone as completed");
  }
  if (!isStaffedEngineer) {
    throw new ForbiddenError("You can only complete milestones on projects you are staffed on as an engineer");
  }
  if (!ENGINEER_COMPLETABLE_FROM.has(existingStatus)) {
    throw new ForbiddenError(`Only an active or at-risk milestone can be marked completed (this one is ${existingStatus})`);
  }
};

/**
 * Completion rule for every role: a milestone cannot be completed while a task
 * linked to it is still open. The caller sees which tasks, and finishes (or
 * unlinks) them first — completing would otherwise leave "done" work with
 * unfinished tasks underneath it.
 */
export const openLinkedTasks = (
  links: { linkType: string; task?: { title: string; status: string } | null }[],
): string[] =>
  links
    .filter((l) => l.linkType === "task" && l.task && l.task.status !== "Completed")
    .map((l) => l.task!.title);
