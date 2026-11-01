// Maps matrix rows (file 01) to the real endpoints / UI. Written from the route definitions and web resources
// (apps/api/src/modules/*/routes.ts, apps/web/src/providers/resources.ts), NOT from the matrix, so a disagreement
// between this map's observed result and the matrix is a finding, not a tuning knob.
// `shared: true` = the page has no endpoint of its own (it reuses one that other pages also read), so a "Deny"
// can legitimately differ; such results carry a remark so a reviewer can tell mapping noise from a real gap.

export interface Probe { method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown; /** key in src/valid-writes.ts: a valid payload on a fresh fixture */ valid?: string }
export interface PageApi {
  read: string | null; write?: Probe | null; shared?: boolean; note?: string;
  /** rows carry a project reference: operational roles must only get assigned projects (owner decision 2026-11-01, item e) */
  projectData?: boolean;
  /** matrix ACTION row that grants named roles a write on this View-only page (for example Admin submits proposals) */
  writeAction?: string;
}

export const PAGE_API: Record<string, PageApi> = {
  "Dashboard": { read: "/dashboard/summary", write: null },
  "User Accounts": { read: "/users", write: { method: "POST", path: "/users", body: {} } },
  "Roles & Permissions": { read: "/roles", write: null, note: "no write endpoint exists" },
  "Projects": { read: "/projects", write: { method: "POST", path: "/projects", body: {} }, projectData: true },
  "Portfolio": { read: null, write: null, note: "UI-only page that reads /projects; it has no endpoint of its own, so no API check" },
  "Workflows": { read: "/workflows", write: null, projectData: true, note: "workflow creation is judged by action (Closeout start, Budget Change Request ...), not by page" },
  "Workflow Configuration": { read: "/workflows/templates", write: { method: "POST", path: "/workflows/templates", body: {} } },
  "Approval Hierarchy": { read: "/workflows/templates", write: null, shared: true, note: "reads the same templates endpoint as Workflow Configuration" },
  "Approvals (milestone and workflow)": { read: "/workflows/approvals", write: null },
  "Documents": { read: "/documents", write: null, projectData: true, note: "uploads are judged by function (FUNCTION: Upload a document)" },
  "Document Types": { read: "/reference/document-types", write: null, shared: true, note: "reference list is readable by every signed-in user" },
  "Proposals": { read: "/proposals", write: { method: "POST", path: "/proposals/submit", valid: "proposals.submit" }, projectData: true, writeAction: "ACTION: Submit a proposal" },
  "Activity Logs / Audit Trail": { read: "/audit-logs", write: null },
  "Security Monitoring / System Oversight": { read: "/audit-logs/security-overview", write: null },
  "User Support": { read: null, note: "no support endpoint found in the API" },
  "Reports": { read: "/engineering-reports", write: null, shared: true, projectData: true, note: "mapped to /engineering-reports (no standalone reports endpoint)" },
  "Tasks": { read: "/tasks", write: { method: "POST", path: "/tasks", valid: "tasks.create" }, projectData: true },
  "Issues": { read: "/issues", write: { method: "POST", path: "/issues", valid: "issues.create" }, projectData: true },
  "RFI / RFA": { read: "/design-requests", write: { method: "POST", path: "/design-requests", valid: "design-requests.create" }, projectData: true, writeAction: "ACTION: Create an RFI/RFA" },
  "Materials and Purchase Requests": { read: "/finance/purchase-requests", write: { method: "POST", path: "/finance/purchase-requests", body: {} } },
  "Employees": { read: "/hr/employees", write: { method: "POST", path: "/hr/employees", body: {} } },
  "Attendance Monitoring": { read: "/hr/attendance", write: null },
  "Attendance Clock-in": { read: null, write: { method: "POST", path: "/attendance", valid: "attendance" }, note: "clock-in is a write; probed with a valid payload" },
  "Payroll": { read: "/payroll/batches/all", write: { method: "POST", path: "/payroll/generate", body: {} } },
  "Workforce Reports": { read: "/hr/reports/workforce", write: null },
  "Budget": { read: "/finance/budgets", write: { method: "POST", path: "/finance/budgets", body: {} } },
  "Expenses and Vendor Payments": { read: "/finance/expenses", write: { method: "POST", path: "/finance/expenses", body: {} } },
  "Impact Awareness": { read: "/lifecycle/impact", write: null, shared: true },
  "Design Submission": { read: "/designs", write: { method: "POST", path: "/designs", valid: "designs.create" }, projectData: true },
  "Design Proposal Approval": { read: "/proposals", write: null, shared: true, projectData: true, note: "reads the shared /proposals endpoint" },
  "Revisions": { read: "/design-revisions", write: { method: "POST", path: "/design-revisions", body: {} }, projectData: true },
  "Blueprints": { read: "/blueprints", write: { method: "POST", path: "/blueprints", valid: "blueprints" }, projectData: true },
  "Progress Reports": { read: "/engineering-reports", write: { method: "POST", path: "/engineering-reports", valid: "engineering-reports.create" }, projectData: true },
  "Requirements": { read: "/requirements", write: { method: "POST", path: "/requirements", valid: "requirements.create" }, projectData: true },
  "Field Documentation": { read: "/documents", write: null, shared: true, projectData: true, note: "field documents are stored in /documents; uploads are judged by function" },
  "Design Repository": { read: "/designs", write: null, shared: true, projectData: true, note: "Consultant 'Designs' screen reads /designs" },
  "Advisory Documents": { read: "/architect-documents", write: { method: "POST", path: "/architect-documents", valid: "architect-documents.create" }, shared: true, projectData: true },
  "Resources and Tools": { read: null, note: "UI-only page, no API" },
  "Account Recovery (fail-safe)": { read: null, note: "public recovery flow (/auth/owner-recovery/initiate); not role-gated by token" },
};

/** Lifecycle/workflow actions (the ACTION: rows). `state` = the project the probe runs against. */
export interface ActionProbe { state: "Proposal" | "Design" | "none"; method: "POST" | "PATCH"; path: (projectId: number) => string; body?: unknown; note: string; /** valid-payload probe(s) from src/valid-writes.ts: every one must be 2xx (Allowed) or 403 (Deny) */ valid?: string[] }

export const ACTION_API: Record<string, ActionProbe | null> = {
  "ACTION: Advance phase (gate must pass)": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/advance`, body: {}, note: "blocked advance expected (409) for authorised roles" },
  "ACTION: Override a failed gate (reason 10+ chars)": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/advance`, body: { override: true, reason: "short" }, note: "9-char reason: authorised roles get a validation error, others 403" },
  "ACTION: Hold / Resume project": { state: "Design", method: "POST", path: (id) => `/projects/${id}/lifecycle/hold`, body: {}, note: "no reason sent so the project is never held" },
  "ACTION: Cancel project at Proposal": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/cancel`, body: {}, note: "no reason sent so the project is never cancelled" },
  "ACTION: Cancel project after Proposal": { state: "Design", method: "POST", path: (id) => `/projects/${id}/lifecycle/cancel`, body: {}, note: "no reason sent so the project is never cancelled" },
  "ACTION: Archive project": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/archive`, body: {}, note: "project is not Completed, so authorised roles get 409" },
  "ACTION: Start Project Closeout workflow": { state: "none", method: "POST", path: () => "", note: "valid payload on a Closeout project", valid: ["workflows.closeout"] },
  "ACTION: Send Engineer's RFI/RFA draft (countersign)": { state: "none", method: "POST", path: () => "", note: "valid payload on an Engineer draft", valid: ["design-requests.send"] },
  "ACTION: Answer RFI/RFA": { state: "none", method: "POST", path: () => "", note: "valid payload on an open RFI", valid: ["design-requests.respond"] },
  "ACTION: Mark milestone completed": { state: "none", method: "POST", path: () => "", note: "valid payload on an active milestone", valid: ["milestones.complete"] },
  "ACTION: Build and submit payroll batch": { state: "none", method: "POST", path: () => "", note: "valid payload on a draft batch", valid: ["payroll.submit"] },
  "ACTION: Approve or return payroll batch": { state: "none", method: "POST", path: () => "", note: "valid payload on a pending batch", valid: ["payroll.decide"] },
  "ACTION: Update a task's status": { state: "none", method: "PATCH", path: () => "", note: "valid status update on a task assigned to Site Personnel", valid: ["tasks.update"] },
  "ACTION: Resolve an issue": { state: "none", method: "PATCH", path: () => "", note: "valid resolution of an open issue", valid: ["issues.resolve"] },
  "ACTION: Submit a proposal": { state: "none", method: "POST", path: () => "", note: "valid payload on a Proposal-phase project", valid: ["proposals.submit"] },
  "ACTION: Create an RFI/RFA": { state: "none", method: "POST", path: () => "", note: "valid payload on a Construction project", valid: ["design-requests.create"] },
  "FUNCTION: Upload a document": { state: "none", method: "POST", path: () => "", note: "valid multipart upload and valid JSON create on a Construction project", valid: ["documents.upload", "documents.json"] },
  "ACTION: Move plan set to for_review": null, // needs a Design-type project with plan sets: covered by LC-171 in Phase C
  "ACTION: Move plan set to approved": null,
};

// ── UI side ───────────────────────────────────────────────────────────────────────────────────────
/** Sidebar link text(s) that represent a matrix page (labels from apps/web/src/providers/resources.ts), and the route. */
export interface PageUi { labels: string[]; approx?: boolean }
export const PAGE_UI: Record<string, PageUi | null> = {
  "Dashboard": { labels: ["Dashboard"] },
  "User Accounts": { labels: ["User Accounts"] },
  "Roles & Permissions": { labels: ["Roles & Permissions"] },
  "Projects": { labels: ["Projects"] },
  "Portfolio": { labels: ["Portfolio"] },
  "Workflows": { labels: ["Workflows"] },
  "Workflow Configuration": { labels: ["Workflow Configuration"] },
  "Approval Hierarchy": { labels: ["Approval Hierarchy"] },
  "Approvals (milestone and workflow)": { labels: ["Approvals"] },
  "Documents": { labels: ["Documents"] },
  "Document Types": { labels: ["Document Types"] },
  "Proposals": { labels: ["Proposals", "Proposal Review"] },
  "Activity Logs / Audit Trail": { labels: ["Activity Logs", "Audit Trail"] },
  "Security Monitoring / System Oversight": { labels: ["Security", "System Oversight"] },
  "User Support": { labels: ["User Support"] },
  "Reports": { labels: ["Reports"] },
  "Tasks": { labels: ["Tasks"] },
  "Issues": { labels: ["Issues"] },
  "RFI / RFA": { labels: ["Requests"], approx: true },
  "Materials and Purchase Requests": null,
  "Employees": { labels: ["Employees"] },
  "Attendance Monitoring": { labels: ["Attendance"] },
  "Attendance Clock-in": { labels: ["Attendance"] },
  "Payroll": { labels: ["Payroll", "Payroll Review"], approx: true },
  "Workforce Reports": { labels: ["Workforce Reports"] },
  "Budget": { labels: ["Budget"] },
  "Expenses and Vendor Payments": { labels: ["Expenses"] },
  "Impact Awareness": { labels: ["Impact Review"], approx: true },
  "Design Submission": { labels: ["Designs"] },
  "Design Proposal Approval": { labels: ["Proposals", "Proposal Review"], approx: true },
  "Revisions": { labels: ["Revisions"] },
  "Blueprints": { labels: ["Blueprints"] },
  "Progress Reports": { labels: ["Progress"], approx: true },
  "Requirements": { labels: ["Requirements"] },
  "Field Documentation": { labels: ["Documents"], approx: true },
  "Design Repository": { labels: ["Designs"], approx: true },
  "Advisory Documents": { labels: ["Advisory Docs"] },
  "Resources and Tools": { labels: ["Resources"] },
  "Account Recovery (fail-safe)": { labels: ["Account Recovery"] },
};

/** Every web route that serves a matrix page (any role's variant), from apps/web/src/providers/resources.ts. */
export const PAGE_ROUTES: Record<string, string[]> = {
  "Dashboard": ["/dashboard"], "User Accounts": ["/it-designer/users"],
  "Roles & Permissions": ["/admin/roles-permissions", "/it-designer/roles-permissions"],
  "Projects": ["/projects", "/admin/projects", "/architect/projects", "/consultant/projects"], "Portfolio": ["/owner/portfolio"],
  "Workflows": ["/workflows", "/admin/workflows"], "Workflow Configuration": ["/admin/workflow-configuration"],
  "Approval Hierarchy": ["/admin/approval-hierarchy"], "Approvals (milestone and workflow)": ["/approvals"],
  "Documents": ["/documents", "/admin/documents"], "Document Types": ["/admin/document-types"],
  "Proposals": ["/proposals", "/owner/proposals", "/it-designer/proposals", "/consultant/proposals"],
  "Activity Logs / Audit Trail": ["/admin/activity-logs", "/it-designer/activity-logs", "/owner/audit-trail"],
  "Security Monitoring / System Oversight": ["/admin/security", "/it-designer/security", "/owner/oversight"],
  "User Support": ["/admin/support", "/it-designer/support"], "Reports": ["/reports"], "Tasks": ["/tasks"], "Issues": ["/issues"],
  "RFI / RFA": ["/requests"], "Materials and Purchase Requests": [], "Employees": ["/employees"],
  "Attendance Monitoring": ["/attendance"], "Attendance Clock-in": ["/attendance"], "Payroll": ["/payroll", "/payroll-review"],
  "Workforce Reports": ["/workforce-reports"], "Budget": ["/budget"], "Expenses and Vendor Payments": ["/expenses"],
  "Impact Awareness": ["/impact-review"], "Design Submission": ["/designs"],
  "Design Proposal Approval": ["/proposals", "/consultant/proposals"], "Revisions": ["/revisions"], "Blueprints": ["/blueprints"],
  "Progress Reports": ["/progress"], "Requirements": ["/requirements"], "Field Documentation": ["/documents"],
  "Design Repository": ["/consultant/designs"], "Advisory Documents": ["/advisory-docs"], "Resources and Tools": ["/resources"],
  "Account Recovery (fail-safe)": ["/owner/account-recovery"],
};
