import * as repo from "./repository.js";
import { projectsRepo } from "../../projects/index.js";
import { projectMemberRepo } from "../../projects/index.js";
import { usersRepo } from "../../iam/index.js";
import * as stream from "./stream.js";
import { NotFoundError } from "../../../core/utils/errors.js";
import { ownsNotification } from "./ownership.js";
import { PROJECT_MEMBER_ROLES } from "../../../core/db/schema/project-members.js";
import type {
  CreateNotificationInput,
  NotificationFilters,
  NotificationScope,
} from "./types.js";

export const getForRecipient = async (
  scope: NotificationScope,
  filters: NotificationFilters,
) => repo.findForRecipient(scope, filters);

// Called directly by other domain services (e.g. budget-approval-steps) — no
// HTTP loopback. Also the single choke point every domain event already goes
// through (see notifyProject below), so C1's SSE push lives here rather than
// needing to touch each of the 12+ call sites individually.
export const create = async (input: CreateNotificationInput) => {
  const created = await repo.create(input);
  if (created) {
    if (input.recipientUserId != null) {
      stream.publishToUser(input.recipientUserId, created);
    } else if (input.recipientRole) {
      const recipients = await usersRepo.findAll({ role: input.recipientRole });
      stream.publishToUsers(recipients.map((u) => u.id), created);
    }
  }
  return created;
};

/**
 * Marks one of the CALLER'S notifications read. Someone else's notification (or one that does
 * not exist) is a 404 either way, so ids cannot be probed.
 */
export const markRead = async (id: number, scope: NotificationScope) => {
  const row = await repo.findById(id);
  if (!row || !ownsNotification(row, scope)) throw new NotFoundError("Notification", String(id));
  return repo.markRead(id);
};

const isMemberRole = (role: string): boolean =>
  (PROJECT_MEMBER_ROLES as readonly string[]).includes(role);

/**
 * J1: the one project-scoped "tell the relevant roles" call every domain
 * event should use, generalizing lifecycle/service.ts's
 * notifyProjectMembersAndPm + tasks/service.ts's notifyPm (both now thin
 * wrappers around this).
 *
 * A role that can actually be staffed on a project (engineer, architect,
 * site-personnel, consultant) resolves to the real staffed user(s) via
 * project-members — a broadcast to every holder of that role org-wide would
 * reach people with nothing to do with this project. "project-manager" is
 * its own case: the project's own pmUserId, not a project-members row.
 * Every other role (admin, it-designer, finance-manager, human-resources,
 * owner) has no per-project staffing concept, so it's a role broadcast.
 * A staffable role with nobody currently staffed is silently skipped rather
 * than falling back to a role broadcast — there is no one to reach.
 */
export const notifyProject = async (
  projectCode: string,
  roles: string[],
  input: { title: string; body: string; link?: string },
): Promise<void> => {
  const recipientUserIds = new Set<number>();
  const roleBroadcasts = new Set<string>();

  const distinctRoles = new Set(roles);
  const memberRoles = [...distinctRoles].filter(isMemberRole);
  // One members query for every staffable role (was one per role).
  const members = memberRoles.length
    ? await projectMemberRepo.findAll({ projectCode })
    : [];

  for (const role of distinctRoles) {
    if (role === "project-manager") {
      const project = await projectsRepo.findByCode(projectCode);
      if (project?.pmUserId != null) recipientUserIds.add(project.pmUserId);
      else roleBroadcasts.add("project-manager");
      continue;
    }
    if (isMemberRole(role)) {
      for (const m of members) if (m.role === role) recipientUserIds.add(m.userId);
      continue;
    }
    roleBroadcasts.add(role);
  }

  await Promise.all([
    ...Array.from(recipientUserIds).map((recipientUserId) =>
      create({ ...input, recipientUserId, projectCode }),
    ),
    ...Array.from(roleBroadcasts).map((recipientRole) =>
      create({ ...input, recipientRole, projectCode }),
    ),
  ]);
};