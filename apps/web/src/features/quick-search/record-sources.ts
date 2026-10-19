// Record sources for the quick-search palette. Each wraps an EXISTING
// role-scoped list hook; nothing here widens what a role can read. A source's
// hook is only called from a component mounted after the palette is first
// opened (see QuickSearchPalette), so no list loads before that.
//
// Scoping notes:
//  * Workflows come from GET /api/workflows, which the server does not scope
//    to the caller's projects, so only admin and it_designer search it (the
//    owner has no workflows page to open one on). Every other role searches
//    its own approvals queue.
//  * Destinations are the role's own page for that record type; a record is
//    only linked when the role has a page that can show it.
import { useBlueprints } from "@/features/blueprint/hooks/useBlueprints";
import { useDesigns } from "@/features/designs/hooks/useDesigns";
import { useFieldDocuments } from "@/features/documents/hooks/use-field-documents";
import { useEngineeringReports } from "@/features/engineering-reports/hooks/useEngineeringReport";
import { useBudgets } from "@/features/finance/budgets/hooks/useBudgets";
import { useExpensesController } from "@/features/finance/hooks/use-expenses";
import { useEmployees } from "@/features/hr/hooks/use-hr";
import { useMyIssues } from "@/features/issues/hooks/use-my-issues";
import { useIssues } from "@/features/issues/hooks/use-issues";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { useProposals } from "@/features/proposals/hooks/useProposals";
import { useRequests } from "@/features/requests/hooks/useRequests";
import { useRequirements } from "@/features/requirements/hooks/useRequirements";
import { useMyTasks } from "@/features/tasks/hooks/use-my-tasks";
import { useUsers } from "@/features/users/hooks/use-users";
import { useActiveWorkflows, useApprovals } from "@/features/workflows/hooks/useWorkflows";
import type { RecordResult, RecordSource, RecordSourceState, Role } from "./types";

const message = (e: unknown): string | null => {
  if (!e) return null;
  if (typeof e === "string") return e;
  return e instanceof Error ? e.message : "Could not load";
};

const state = (results: RecordResult[], loading: boolean, error: unknown): RecordSourceState => ({
  results,
  loading,
  error: message(error),
});

const ALL_PROJECT_ROLES: Role[] = [
  "admin",
  "owner",
  "it_designer",
  "project_manager",
  "finance_manager",
  "architect",
  "engineer",
  "consultant",
];

/** Where each role's project list lives; the detail page is shared. */
const projectDetail = (id: number | string) => `/projects/${id}`;

export const RECORD_SOURCES: RecordSource[] = [
  {
    kind: "project",
    label: "Projects",
    roles: ALL_PROJECT_ROLES,
    useItems: () => {
      const r = useProjects();
      return state(
        r.projects.map((p) => ({
          id: String(p.id),
          kind: "project",
          title: p.name,
          subtitle: `${p.code} · ${p.status}`,
          route: projectDetail(p.id),
          keywords: [p.code, p.client, p.location],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "proposal",
    label: "Proposals",
    roles: ["architect", "consultant", "owner", "it_designer"],
    useItems: () => {
      const r = useProposals({ pageSize: 100 });
      return state(
        r.proposals.map((p) => ({
          id: String(p.id),
          kind: "proposal",
          title: p.title,
          subtitle: `${p.proposalId} · ${p.projectCode} · ${p.status}`,
          // Resolved per role in routeForRole below.
          route: "/proposals",
          keywords: [p.proposalId, p.projectCode],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    // GET /api/workflows is not project-scoped on the server: restricted to
    // the roles that may see every workflow.
    kind: "workflow",
    label: "Workflows",
    roles: ["admin", "it_designer"],
    useItems: () => {
      const r = useActiveWorkflows({ pageSize: 100 });
      return state(
        r.workflows.map((w) => ({
          id: String(w.id),
          kind: "workflow",
          title: w.title,
          subtitle: `${w.code} · ${w.projectCode} · ${w.status}`,
          route: "/admin/workflows",
          keywords: [w.code, w.projectCode, w.templateName ?? ""],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "approval",
    label: "Approvals",
    roles: ["project_manager", "human_resources", "finance_manager", "architect", "engineer"],
    useItems: () => {
      const r = useApprovals("pending", 100);
      return state(
        r.items.map((a) => ({
          id: String(a.stageId),
          kind: "approval",
          title: a.title,
          subtitle: `${a.workflowCode} · ${a.projectCode}`,
          route: "/approvals",
          keywords: [a.workflowCode, a.projectCode, a.type ?? ""],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "design",
    label: "Designs",
    roles: ["architect", "consultant"],
    useItems: () => {
      const r = useDesigns();
      return state(
        r.designs.map((d) => ({
          id: String(d.id),
          kind: "design",
          title: d.name,
          subtitle: `${d.code} · ${d.projectCode} · ${d.discipline}`,
          route: `/designs/${d.id}`,
          keywords: [d.code, d.projectCode, d.discipline],
        })),
        r.loading,
        undefined,
      );
    },
  },
  {
    kind: "document",
    label: "Documents",
    roles: ["admin", "it_designer", "project_manager", "site_personnel", "consultant"],
    useItems: () => {
      const r = useFieldDocuments();
      return state(
        r.documents.map((d) => ({
          id: String(d.id),
          kind: "document",
          title: d.title,
          subtitle: `${d.project} · ${d.type}`,
          route: "/documents",
          keywords: [d.documentId, d.project, d.type],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "person",
    label: "People",
    roles: ["human_resources"],
    useItems: () => {
      const r = useEmployees();
      return state(
        r.data.map((e) => ({
          id: String(e.dbId),
          kind: "person",
          title: e.name,
          subtitle: `${e.id} · ${e.role} · ${e.site}`,
          route: `/employees/edit/${e.dbId}`,
          keywords: [e.id, e.role, e.department, e.site, e.email],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "person",
    label: "Users",
    roles: ["it_designer"],
    useItems: () => {
      const r = useUsers();
      return state(
        r.users.map((u) => ({
          id: String(u.id),
          kind: "person",
          title: u.name,
          subtitle: `${u.email} · ${u.role}`,
          route: "/it-designer/users",
          keywords: [u.email, u.role],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "task",
    label: "Tasks",
    roles: ["project_manager", "engineer", "site_personnel"],
    useItems: () => {
      const r = useMyTasks();
      return state(
        r.tasks.map((t) => ({
          id: String(t.id),
          kind: "task",
          title: t.title,
          subtitle: `${t.taskCode} · ${t.projectCode} · ${t.status}`,
          route: "/tasks",
          keywords: [t.taskCode, t.projectCode],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "issue",
    label: "Issues",
    roles: ["project_manager", "engineer"],
    useItems: () => {
      const r = useIssues({ pageSize: 100 });
      return state(
        r.issues.map((i) => ({
          id: String(i.id),
          kind: "issue",
          title: i.title,
          subtitle: `${i.issueCode} · ${i.projectCode} · ${i.status}`,
          route: "/issues",
          keywords: [i.issueCode, i.projectCode, i.category],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "issue",
    label: "Issues",
    roles: ["site_personnel"],
    useItems: () => {
      const r = useMyIssues();
      return state(
        r.issues.map((i) => ({
          id: String(i.id),
          kind: "issue",
          title: i.title,
          subtitle: `${i.issueCode} · ${i.projectCode} · ${i.status}`,
          route: "/issues",
          keywords: [i.issueCode, i.projectCode, i.category],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "requirement",
    label: "Requirements",
    roles: ["engineer", "site_personnel"],
    useItems: () => {
      const r = useRequirements({ pageSize: 100 });
      return state(
        r.requirements.map((q) => ({
          id: String(q.dbId),
          kind: "requirement",
          title: q.title,
          subtitle: `${q.id} · ${q.project} · ${q.status}`,
          route: "/requirements",
          keywords: [q.id, q.project, q.category],
        })),
        r.loading,
        undefined,
      );
    },
  },
  {
    kind: "report",
    label: "Reports",
    roles: ["engineer"],
    useItems: () => {
      const r = useEngineeringReports("all", { pageSize: 100 });
      return state(
        r.reports.map((p) => ({
          id: String(p.dbId),
          kind: "report",
          title: p.title,
          subtitle: `${p.id} · ${p.project} · ${p.type}`,
          route: "/progress",
          keywords: [p.id, p.project, p.type],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "budget",
    label: "Budgets",
    roles: ["finance_manager"],
    useItems: () => {
      const r = useBudgets();
      return state(
        r.budgets.map((b) => ({
          id: String(b.id),
          kind: "budget",
          title: `${b.project} · ${b.category}`,
          subtitle: `FY ${b.fiscalYear} · ${b.owner}`,
          route: "/budget",
          keywords: [b.project, b.category, b.owner],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "expense",
    label: "Expenses",
    roles: ["finance_manager"],
    useItems: () => {
      const r = useExpensesController();
      return state(
        r.expenses.map((x) => ({
          id: x.id,
          kind: "expense",
          title: x.vendor,
          subtitle: `${x.id} · ${x.project} · ${x.category}`,
          route: "/expenses",
          keywords: [x.id, x.project, x.category],
        })),
        r.isLoading,
        undefined,
      );
    },
  },
  {
    kind: "request",
    label: "Requests",
    roles: ["admin", "project_manager", "engineer", "architect", "consultant"],
    useItems: () => {
      const r = useRequests({ kind: "all", status: "all" });
      return state(
        r.requests.map((q) => ({
          id: String(q.id),
          kind: "request",
          title: `${q.number} · ${q.subject}`,
          subtitle: `${q.kind.toUpperCase()} · ${q.projectCode}`,
          route: `/requests?open=${q.id}`,
          keywords: [q.number, q.projectCode, q.kind],
        })),
        r.loading,
        r.error,
      );
    },
  },
  {
    kind: "blueprint",
    label: "Blueprints",
    roles: ["architect", "consultant"],
    useItems: () => {
      const r = useBlueprints();
      return state(
        r.blueprints.map((b) => ({
          id: String(b.id),
          kind: "blueprint",
          title: b.title,
          subtitle: `${b.drawingNumber} · ${b.folder}`,
          route: "/blueprints",
          keywords: [b.drawingNumber, b.folder, b.discipline ?? ""],
        })),
        r.loading,
        undefined,
      );
    },
  },
];

// A few record types live on a different page depending on the role.
const ROUTE_OVERRIDES: Partial<Record<Role, Partial<Record<RecordResult["kind"], string>>>> = {
  owner: { project: "/owner/portfolio", proposal: "/owner/proposals" },
  it_designer: { project: "/admin/projects", proposal: "/it-designer/proposals", document: "/admin/documents" },
  admin: { project: "/admin/projects", document: "/admin/documents" },
  consultant: {
    project: "/consultant/projects",
    proposal: "/consultant/proposals",
    design: "/consultant/designs",
    document: "/advisory-docs",
    blueprint: "/blueprint-reviews",
  },
  architect: { project: "/architect/projects" },
};

/** Final destination of a record for `role`. */
export function routeForRole(role: Role, r: RecordResult): string {
  // Records with their own detail page (project, design, request) keep it for
  // roles that can open it; roles with only a list page get that list.
  const override = ROUTE_OVERRIDES[role]?.[r.kind];
  if (override) return override;
  return r.route;
}

export const sourcesFor = (role: Role): RecordSource[] => RECORD_SOURCES.filter((s) => s.roles.includes(role));
