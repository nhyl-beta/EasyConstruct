// Quick-search registry: the actions and pages a role may jump to.
//
// Pages are DERIVED from the role's own nav (config/role-tab.ts) so they
// cannot drift from the sidebar and tab bar, then filtered by
// ROLE_RESOURCE_ACCESS. Actions are listed explicitly; each states the roles
// that may use it, with the server guard that justifies it.
//
// Actions only ever navigate. Those that open a dialog on the target page use
// `?action=<key>` (read once by useOpenOnAction on that page), or the
// existing `?new=1` convention. The user confirms inside the dialog.
import {
  Banknote,
  BarChart2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  FilePlus2,
  FileText,
  FileUp,
  FolderPlus,
  GitBranch,
  KeyRound,
  Layers,
  MessageSquareQuote,
  NotepadTextDashed,
  Receipt,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  SquarePen,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { ROLE_CONFIGS, type RoleConfig } from "@/config/role-tab";
import { resources } from "@/providers/resources";
import type { QuickEntry, Role } from "./types";

// ── Route → resource ────────────────────────────────────────────────────────

const stripQuery = (route: string) => route.split("?")[0] ?? route;

const LIST_ROUTE_TO_RESOURCE = new Map<string, string>(
  resources.flatMap((r) => (typeof r.list === "string" ? [[r.list, r.name] as [string, string]] : [])),
);
// Nav routes that have no entry in providers/resources.ts.
LIST_ROUTE_TO_RESOURCE.set("/consultant/design-reviews", "consultant-design-reviews");

/** The resource a nav route belongs to, or undefined when it has none (for example /blueprint-reviews). */
export const resourceForRoute = (route: string): string | undefined =>
  LIST_ROUTE_TO_RESOURCE.get(stripQuery(route));

export const roleHasResource = (role: Role, resource: string | undefined): boolean =>
  resource === undefined || (ROLE_RESOURCE_ACCESS[role] ?? []).includes(resource);

// ── Pages (derived from the nav) ────────────────────────────────────────────

const PAGE_KEYWORDS: Record<string, string[]> = {
  "/dashboard": ["home", "overview"],
  "/approvals": ["approve", "approval", "decisions", "pending", "review"],
  "/payroll": ["pay", "salary run", "salary", "wages"],
  "/payroll-review": ["pay", "payroll", "salary run", "approve payroll"],
  "/requests": ["rfi", "rfa", "request for information", "request for approval", "requests"],
  "/transmittals": ["transmittal", "cover sheet"],
  "/attendance": ["clock", "clock in", "time", "dtr", "timesheet"],
  "/issues": ["issue", "problem", "incident", "ticket"],
  "/tasks": ["task", "todo", "assignment"],
  "/documents": ["files", "docs", "upload"],
  "/advisory-docs": ["advisory", "upload", "documents", "docs"],
  "/budget": ["budgets", "allocation", "money"],
  "/expenses": ["expense", "spend", "spending", "cost"],
  "/revisions": ["revision", "changes", "version"],
  "/reports": ["report", "analytics"],
  "/workforce-reports": ["workforce", "headcount", "manpower"],
  "/owner/audit-trail": ["audit", "history", "log"],
  "/admin/activity-logs": ["audit", "logs", "history"],
  "/it-designer/activity-logs": ["audit", "logs", "history"],
};

export function pagesFor(role: Role): QuickEntry[] {
  const config: RoleConfig | undefined = ROLE_CONFIGS[role];
  if (!config) return [];
  const navItems = [...config.tabs, ...config.sections.flatMap((s) => s.items)];
  const seen = new Set<string>();
  const out: QuickEntry[] = [];
  for (const item of navItems) {
    const path = stripQuery(item.route);
    if (seen.has(path)) continue;
    const resource = resourceForRoute(path);
    if (!roleHasResource(role, resource)) continue;
    seen.add(path);
    out.push({
      id: `page:${path}`,
      kind: "page",
      label: item.label,
      keywords: PAGE_KEYWORDS[path] ?? [],
      icon: item.icon,
      route: item.route,
      roles: [role],
      resource,
    });
  }
  return out;
}

// ── Actions (explicit; every one names the guard behind it) ─────────────────

const ADMIN_LIKE: Role[] = ["admin"];

export const ACTIONS: QuickEntry[] = [
  // — Admin —
  {
    id: "admin:new-workflow",
    kind: "action",
    label: "New workflow",
    description: "Start an approval workflow",
    keywords: ["workflow", "start workflow", "initiate", "approval"],
    icon: GitBranch,
    route: "/admin/workflows?action=new-workflow",
    roles: ADMIN_LIKE,
    resource: "admin-workflows",
    changesData: true, // server: workflows/routes.ts canInitiateWorkflow includes admin
  },
  {
    id: "admin:new-project",
    kind: "action",
    label: "New project",
    description: "Create a project",
    keywords: ["project", "create project", "add project"],
    icon: FolderPlus,
    route: "/projects/new",
    roles: ADMIN_LIKE,
    resource: "admin-projects",
    changesData: true, // server: projects/routes.ts POST = project-manager, admin
  },
  {
    id: "admin:upload-document",
    kind: "action",
    label: "Upload document",
    description: "File a project document",
    keywords: ["document", "file", "upload", "docs"],
    icon: FileUp,
    route: "/admin/documents?action=upload-document",
    roles: ["admin", "it_designer"],
    resource: "admin-documents",
    changesData: true, // server: documents/routes.ts POST /upload includes admin, it-designer
  },

  // — IT Designer —
  {
    id: "it:new-user",
    kind: "action",
    label: "New user",
    description: "Create a user account",
    keywords: ["user", "account", "add user", "create user"],
    icon: UserPlus,
    route: "/it-designer/users?new=1",
    roles: ["it_designer"],
    resource: "it-designer-users",
    changesData: true, // server: users routes are it-designer/admin only
  },

  // — Owner (read-only: shortcuts to pages) —
  {
    id: "owner:audit-trail",
    kind: "action",
    label: "Open Audit Trail",
    description: "Who did what, across the organization",
    keywords: ["audit", "activity", "history", "log"],
    icon: ShieldCheck,
    route: "/owner/audit-trail",
    roles: ["owner"],
    resource: "owner-audit-trail",
  },
  {
    id: "owner:oversight",
    kind: "action",
    label: "Open Oversight",
    description: "System oversight",
    keywords: ["oversight", "system", "security"],
    icon: ShieldAlert,
    route: "/owner/oversight",
    roles: ["owner"],
    resource: "owner-oversight",
  },
  {
    id: "owner:portfolio",
    kind: "action",
    label: "Open Portfolio",
    description: "Every project at a glance",
    keywords: ["portfolio", "projects"],
    icon: Layers,
    route: "/owner/portfolio",
    roles: ["owner"],
    resource: "owner-portfolio",
  },
  {
    id: "owner:account-recovery",
    kind: "action",
    label: "Recover account",
    description: "Open account recovery",
    keywords: ["recovery", "password", "reset", "locked out"],
    icon: KeyRound,
    route: "/owner/account-recovery",
    roles: ["owner"],
    resource: "owner-account-recovery",
  },

  // — Project Manager —
  {
    id: "pm:new-project",
    kind: "action",
    label: "New project",
    description: "Create a project",
    keywords: ["project", "create project", "add project"],
    icon: FolderPlus,
    route: "/projects/new",
    roles: ["project_manager"],
    resource: "projects",
    changesData: true, // server: projects/routes.ts POST = project-manager, admin
  },
  {
    id: "pm:new-workflow",
    kind: "action",
    label: "New workflow",
    description: "Start an approval workflow",
    keywords: ["workflow", "start workflow", "initiate", "approval", "proposal"],
    icon: GitBranch,
    route: "/workflows?action=new-workflow",
    roles: ["project_manager"],
    resource: "workflows",
    changesData: true, // server: workflows/routes.ts canInitiateWorkflow
  },
  {
    id: "pm:upload-document",
    kind: "action",
    label: "Upload document",
    description: "File a project document",
    keywords: ["document", "file", "upload", "docs"],
    icon: FileUp,
    route: "/documents?action=upload-document",
    roles: ["project_manager"],
    resource: "documents",
    changesData: true, // server: documents/routes.ts POST /upload includes project-manager
  },
  {
    id: "pm:create-task",
    kind: "action",
    label: "Create task",
    description: "Assign a field task",
    keywords: ["task", "assign", "todo", "new task"],
    icon: CheckSquare,
    route: "/tasks",
    roles: ["project_manager", "engineer"],
    resource: "tasks",
    changesData: true, // server: tasks/routes.ts POST = project-manager, engineer
  },

  // — Shared: approvals —
  {
    id: "shared:review-approvals",
    kind: "action",
    label: "Review approvals",
    description: "Decide what is waiting on you",
    keywords: ["approve", "approvals", "pending", "decide", "queue"],
    icon: ClipboardCheck,
    route: "/approvals",
    roles: ["project_manager", "human_resources", "finance_manager", "architect", "engineer"],
    resource: "approvals",
  },

  // — Requests (RFI / RFA) —
  {
    id: "requests:raise",
    kind: "action",
    label: "Raise RFI / RFA",
    description: "Ask the design team for information or approval",
    keywords: ["rfi", "rfa", "request", "requests", "new rfi", "new rfa", "raise request"],
    icon: MessageSquareQuote,
    route: "/requests?action=raise",
    roles: ["project_manager", "engineer", "admin"],
    resource: "requests",
    changesData: true, // server: design-requests/routes.ts raisers = project-manager, engineer, admin
  },
  {
    id: "requests:answer",
    kind: "action",
    label: "Answer requests",
    description: "Open your RFI / RFA inbox",
    keywords: ["rfi", "rfa", "request", "requests", "inbox", "respond"],
    icon: MessageSquareQuote,
    route: "/requests",
    roles: ["architect", "consultant"],
    resource: "requests", // server: design-requests/routes.ts responders = architect, consultant, admin
  },

  // — Human Resources —
  {
    id: "hr:add-employee",
    kind: "action",
    label: "Add employee",
    description: "Create an employee record",
    keywords: ["employee", "staff", "hire", "new employee", "worker"],
    icon: UserPlus,
    route: "/employees/new",
    roles: ["human_resources"],
    resource: "employees",
    changesData: true, // route guard: App.tsx RequireRole human_resources/admin/it_designer (server has no role guard on POST /employees)
  },
  {
    id: "hr:generate-payroll",
    kind: "action",
    label: "Generate payroll",
    description: "Start a payroll batch",
    keywords: ["payroll", "pay", "salary run", "payslip", "batch"],
    icon: DollarSign,
    route: "/payroll?action=generate-payroll",
    roles: ["human_resources"],
    resource: "payroll",
    changesData: true, // server: payroll/routes.ts canWrite = human-resources, admin, it-designer
  },
  {
    id: "hr:verify-attendance",
    kind: "action",
    label: "Verify attendance",
    description: "Review and verify attendance logs",
    keywords: ["attendance", "verify", "clock", "timesheet"],
    icon: UserCheck,
    route: "/attendance",
    roles: ["human_resources"],
    resource: "attendance", // server: attendance/routes.ts bulk-verify = human-resources, admin
  },
  {
    id: "hr:workforce-reports",
    kind: "action",
    label: "Workforce reports",
    description: "Headcount and workforce figures",
    keywords: ["workforce", "headcount", "report", "manpower"],
    icon: BarChart2,
    route: "/workforce-reports",
    roles: ["human_resources"],
    resource: "workforce-reports",
  },

  // — Finance Manager —
  {
    id: "fin:review-payroll",
    kind: "action",
    label: "Review payroll",
    description: "Approve or return payroll batches",
    keywords: ["payroll", "pay", "salary run", "approve payroll", "batch"],
    icon: ClipboardList,
    route: "/payroll-review",
    roles: ["finance_manager"],
    resource: "payroll-review", // server: /api/finance/payroll-review = finance-manager, admin, it-designer
  },
  {
    id: "fin:new-budget",
    kind: "action",
    label: "New budget",
    description: "Create a project budget",
    keywords: ["budget", "allocation", "plan"],
    icon: Banknote,
    route: "/budget?action=new-budget",
    roles: ["finance_manager"],
    resource: "budget",
    changesData: true, // server: finance/budget/routes.ts = finance-manager, admin
  },
  {
    id: "fin:add-expense",
    kind: "action",
    label: "Add expense",
    description: "Record an expense",
    keywords: ["expense", "spend", "cost", "receipt", "record expense"],
    icon: Receipt,
    route: "/expenses?action=new-expense",
    roles: ["finance_manager"],
    resource: "expenses",
    changesData: true, // server: finance/expenses/routes.ts POST = finance-manager, admin
  },
  {
    id: "fin:impact-review",
    kind: "action",
    label: "Open Impact review",
    description: "See what a change does to budgets",
    keywords: ["impact", "review", "change"],
    icon: Clock,
    route: "/impact-review",
    roles: ["finance_manager"],
    resource: "impact-review",
  },

  // — Architect —
  {
    id: "arch:new-design",
    kind: "action",
    label: "New design",
    description: "Upload a design",
    keywords: ["design", "upload design", "drawing"],
    icon: Ruler,
    route: "/designs/new",
    roles: ["architect"],
    resource: "designs",
    changesData: true, // server: designs/routes.ts POST = architect, admin
  },
  {
    id: "arch:submit-proposal",
    kind: "action",
    label: "Submit proposal",
    description: "Write a design proposal",
    keywords: ["proposal", "new proposal", "submit"],
    icon: FilePlus2,
    route: "/proposals?action=new-proposal",
    roles: ["architect"],
    resource: "proposals",
    changesData: true, // server: proposals/routes.ts canAuthor = architect, admin
  },
  {
    id: "arch:upload-blueprint",
    kind: "action",
    label: "Upload blueprint",
    description: "File a blueprint",
    keywords: ["blueprint", "drawing", "plan", "upload"],
    icon: NotepadTextDashed,
    route: "/blueprints?action=new-blueprint",
    roles: ["architect"],
    resource: "blueprints",
    changesData: true, // route guard only: server POST /blueprints has no role guard
  },
  {
    id: "arch:revisions",
    kind: "action",
    label: "Open Revisions",
    description: "Revision history and changes",
    keywords: ["revision", "version", "changes"],
    icon: SquarePen,
    route: "/revisions",
    roles: ["architect"],
    resource: "revisions",
  },

  // — Engineer —
  {
    id: "eng:new-report",
    kind: "action",
    label: "New progress report",
    description: "Submit a site progress report",
    keywords: ["progress", "report", "site report", "update"],
    icon: BarChart2,
    route: "/progress?action=new-report",
    roles: ["engineer"],
    resource: "progress",
    changesData: true, // server: engineering-reports/routes.ts POST = engineer, admin
  },
  {
    id: "eng:new-requirement",
    kind: "action",
    label: "New requirement",
    description: "Draft a requirement",
    keywords: ["requirement", "submit requirement", "spec", "specification"],
    icon: ClipboardList,
    route: "/requirements?action=new-requirement",
    roles: ["engineer", "site_personnel"],
    resource: "requirements",
    changesData: true, // server: requirements/routes.ts POST = engineer, admin, site-personnel
  },
  {
    id: "eng:report-issue",
    kind: "action",
    label: "Report issue",
    description: "Report a site issue",
    keywords: ["issue", "problem", "incident", "safety", "defect"],
    icon: ShieldAlert,
    route: "/issues?action=report-issue",
    roles: ["engineer", "site_personnel"],
    resource: "issues",
    changesData: true, // server: issues/routes.ts POST = site-personnel, engineer
  },

  // — Site Personnel —
  {
    id: "site:attendance",
    kind: "action",
    label: "Record attendance",
    description: "Clock in or out",
    keywords: ["clock", "clock in", "clock out", "time in", "attendance", "dtr"],
    icon: UserCheck,
    route: "/attendance",
    roles: ["site_personnel"],
    resource: "attendance",
    changesData: true, // server: attendance/routes.ts POST = site-personnel, admin, it-designer
  },
  {
    id: "site:update-task",
    kind: "action",
    label: "Update task",
    description: "Start or complete an assigned task",
    keywords: ["task", "status", "complete", "progress"],
    icon: CheckSquare,
    route: "/tasks",
    roles: ["site_personnel"],
    resource: "tasks",
    changesData: true, // server: tasks/routes.ts PATCH /:id/status = site-personnel
  },
  {
    id: "site:upload-field-doc",
    kind: "action",
    label: "Upload field documentation",
    description: "File a site document or photo",
    keywords: ["document", "photo", "field report", "upload", "file"],
    icon: FileUp,
    route: "/documents",
    roles: ["site_personnel"],
    resource: "documents",
    changesData: true, // server: documents/routes.ts POST /upload includes site-personnel
  },

  // — Consultant —
  {
    id: "con:upload-advisory",
    kind: "action",
    label: "Upload advisory",
    description: "File an advisory document",
    keywords: ["advisory", "document", "upload", "docs"],
    icon: FileUp,
    route: "/advisory-docs?new=1",
    roles: ["consultant"],
    resource: "advisory-docs",
    changesData: true, // server: documents/routes.ts POST /upload includes consultant
  },
  {
    id: "con:review-proposals",
    kind: "action",
    label: "Review proposals",
    description: "Proposals waiting for your review",
    keywords: ["proposal", "review", "approve"],
    icon: FileText,
    route: "/consultant/proposals",
    roles: ["consultant"],
    resource: "consultant-proposals",
  },
  {
    id: "con:design-reviews",
    kind: "action",
    label: "Open Design reviews",
    description: "Decide on design reviews",
    keywords: ["design", "review", "decide"],
    icon: Users,
    route: "/consultant/design-reviews",
    roles: ["consultant"],
    resource: "consultant-design-reviews",
  },
  {
    id: "con:blueprint-reviews",
    kind: "action",
    label: "Open Blueprint reviews",
    description: "Review submitted blueprints",
    keywords: ["blueprint", "review", "drawing"],
    icon: NotepadTextDashed,
    route: "/blueprint-reviews",
    roles: ["consultant"],
    // No resource: the page is in the consultant's nav but not in providers/resources.ts.
  },
];

/** Every action offered to `role`. */
export function actionsFor(role: Role): QuickEntry[] {
  return ACTIONS.filter((a) => a.roles.includes(role) && roleHasResource(role, a.resource));
}

/** Actions then pages, as the palette searches them. */
export function entriesFor(role: Role): QuickEntry[] {
  return [...actionsFor(role), ...pagesFor(role)];
}

/**
 * The empty-query list: the role's primary action first (when it matches one
 * of its actions), then the other actions, capped.
 */
export function defaultActionsFor(role: Role, limit = 6): QuickEntry[] {
  const actions = actionsFor(role);
  const primaryRoute = ROLE_CONFIGS[role]?.primaryAction.route;
  const primaryPath = primaryRoute ? stripQuery(primaryRoute) : undefined;
  const primary = primaryPath ? actions.find((a) => stripQuery(a.route) === primaryPath) : undefined;
  const rest = actions.filter((a) => a !== primary);
  return (primary ? [primary, ...rest] : rest).slice(0, limit);
}

/** The first few pages of the role's nav, for the empty-query list. */
export function defaultPagesFor(role: Role, limit = 6): QuickEntry[] {
  return pagesFor(role).slice(0, limit);
}
