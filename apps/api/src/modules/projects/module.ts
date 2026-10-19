import type { ApiModule } from "../types.js";
import projectRoutes from "./projects/routes.js";
import revisionsRoutes from "./revisions/routes.js";
import taskRoutes from "./tasks/routes.js";
import issueRoutes from "./issues/routes.js";
import requirementRoutes from "./requirements/routes.js";
import engineeringReportRoutes from "./engineering-reports/routes.js";
import projectMemberRoutes from "./project-members/routes.js";
import stakeholderRoutes from "./project-stakeholders/routes.js";
import milestoneRoutes from "./milestones/routes.js";
import myActionsRoutes from "./lifecycle/my-actions.js";
import calendarRoutes from "./calendar/routes.js";
import dashboardRoutes from "./dashboard/routes.js";

export const module: ApiModule = {
  name: "projects",
  flag: "MODULE_PROJECTS",
  mounts: [
    { order: 0, prefix: "/api/projects", router: projectRoutes },
    { order: 4, prefix: "/api/revisions", router: revisionsRoutes },
    { order: 17, prefix: "/api/tasks", router: taskRoutes },
    { order: 18, prefix: "/api/issues", router: issueRoutes },
    { order: 24, prefix: "/api/requirements", router: requirementRoutes },
    { order: 25, prefix: "/api/engineering-reports", router: engineeringReportRoutes },
    { order: 28, prefix: "/api/project-members", router: projectMemberRoutes },
    { order: 29, prefix: "/api/stakeholders", router: stakeholderRoutes },
    { order: 33, prefix: "/api/milestones", router: milestoneRoutes },
    { order: 39, prefix: "/api/lifecycle", router: myActionsRoutes },
    { order: 40, prefix: "/api/calendar", router: calendarRoutes },
    { order: 43, prefix: "/api/dashboard", router: dashboardRoutes },
  ],
  ownsTables: [
    "projects", "project_members", "project_stakeholders", "project_phase_history",
    "milestones", "milestone_links", "tasks", "issues", "revisions", "requirements",
    "engineering_reports",
  ],
};
