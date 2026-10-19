// apps/api/src/calendar/service.ts
//
// Cross-project calendar events for the requesting user: milestone due
// dates, workflow submissions, lifecycle phase transitions ("progress") and the
// user's own task due dates. Scoping is visibleProjects() in events.ts, which
// mirrors lifecycle/my-actions.ts; the optional date window only narrows what
// is returned, never what a user may see.
import * as projectsRepo from "../projects/repository.js";
import * as projectMemberRepo from "../project-members/repository.js";
import * as milestonesRepo from "../milestones/repository.js";
import * as workflowsRepo from "../workflows/repository.js";
import * as lifecycleRepo from "../lifecycle/repository.js";
import * as tasksRepo from "../tasks/repository.js";
import { PROJECT_MEMBER_ROLES } from "../db/schema/project-members.js";
import { todayManila } from "../utils/dates.js";
import {
  inRange,
  milestoneAttention,
  sameName,
  submissionAttention,
  visibleProjects,
  type CalendarEvent,
  type DateRange,
} from "./events.js";

export type { CalendarEvent, CalendarEventType } from "./events.js";

const isMemberRole = (role: string): boolean => (PROJECT_MEMBER_ROLES as readonly string[]).includes(role);

const toIsoDate = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

export const getCalendarEvents = async (
  actor: { id: number; role: string; name?: string },
  range: DateRange | null = null,
): Promise<CalendarEvent[]> => {
  const me = actor.name ?? "";
  const today = todayManila();
  const allProjects = await projectsRepo.findAll({});
  const memberships = isMemberRole(actor.role) ? await projectMemberRepo.findAll({ userId: actor.id }) : [];
  const relevant = visibleProjects(actor, allProjects, isMemberRole(actor.role), new Set(memberships.map((m) => m.projectCode)));

  const projectByCode = new Map(relevant.map((p) => [p.code, p]));
  const codes = [...projectByCode.keys()];
  const nameOf = (code: string) => projectByCode.get(code)?.name ?? code;
  const events: CalendarEvent[] = [];

  // Grouped queries instead of one per project.
  const [milestonesByCode, historyByCode, allWorkflows, myTasks] = await Promise.all([
    milestonesRepo.findAllForProjects(codes),
    lifecycleRepo.findPhaseHistoryForProjects(codes),
    workflowsRepo.findWorkflowsForProjects(codes),
    tasksRepo.findAll({ assignedToUserId: actor.id }),
  ]);

  for (const code of codes) {
    for (const m of milestonesByCode.get(code) ?? []) {
      const date = toIsoDate(m.estimatedCompletionDate);
      if (!date || !inRange(date, range)) continue;
      events.push({
        id: `milestone-${m.id}`,
        type: "milestone",
        date,
        title: m.title,
        projectCode: m.projectCode,
        projectName: nameOf(m.projectCode),
        detail: m.description ?? undefined,
        sourceId: m.id,
        status: m.status,
        involves: [m.createdBy].filter(Boolean),
        mine: sameName(m.createdBy, me),
        attention: milestoneAttention(m.status, date, today),
      });
    }
  }

  for (const wf of allWorkflows) {
    if (!projectByCode.has(wf.projectCode)) continue;
    const date = toIsoDate(wf.createdAt);
    if (!date || !inRange(date, range)) continue;
    events.push({
      id: `submission-${wf.id}`,
      type: "submission",
      date,
      title: wf.title,
      projectCode: wf.projectCode,
      projectName: nameOf(wf.projectCode),
      detail: `Submitted · ${wf.status}`,
      sourceId: wf.id,
      status: wf.status,
      involves: [wf.createdBy].filter(Boolean),
      mine: wf.createdByUserId === actor.id || sameName(wf.createdBy, me),
      attention: submissionAttention(wf.status),
    });
  }

  for (const code of codes) {
    for (const h of historyByCode.get(code) ?? []) {
      const date = toIsoDate(h.createdAt);
      if (!date || !inRange(date, range)) continue;
      events.push({
        id: `progress-${h.id}`,
        type: "progress",
        date,
        title: `${h.fromStatus} → ${h.toStatus}`,
        projectCode: h.projectCode,
        projectName: nameOf(h.projectCode),
        detail: `Changed by ${h.changedBy}`,
        sourceId: h.id,
        status: h.toStatus,
        involves: [h.changedBy].filter(Boolean),
        mine: sameName(h.changedBy, me),
      });
    }
  }

  // The user's own tasks only (assigned to them), and only on projects they can see.
  for (const t of myTasks) {
    if (!projectByCode.has(t.projectCode) || !t.dueDate) continue;
    const date = toIsoDate(t.dueDate);
    if (!date || !inRange(date, range)) continue;
    events.push({
      id: `task-${t.id}`,
      type: "task",
      date,
      title: t.title,
      projectCode: t.projectCode,
      projectName: nameOf(t.projectCode),
      detail: `${t.taskCode} · ${t.priority} priority`,
      sourceId: t.id,
      status: t.status,
      involves: [t.assignedToName ?? me].filter(Boolean),
      mine: true,
      attention: t.status !== "Completed" && date < today ? "overdue" : undefined,
    });
  }

  return events;
};
