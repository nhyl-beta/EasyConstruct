// Maps matrix rows (file 01) to the real endpoints / UI. Written from the route definitions and web resources
// (apps/api/src/modules/*/routes.ts, apps/web/src/providers/resources.ts), NOT from the matrix, so a disagreement
// between this map's observed result and the matrix is a finding, not a tuning knob.
// `shared: true` = the page has no endpoint of its own (it reuses one that other pages also read), so a "Deny"
// can legitimately differ; such results carry a remark so a reviewer can tell mapping noise from a real gap.

export interface Probe { method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown }
export interface PageApi { read: string | null; write?: Probe | null; shared?: boolean; note?: string }

export const PAGE_API: Record<string, PageApi> = {
  "Dashboard": { read: "/dashboard/summary", write: null },
  "User Accounts": { read: "/users", write: { method: "POST", path: "/users", body: {} } },
  "Roles & Permissions": { read: "/roles", write: null, note: "no write endpoint exists" },
  "Projects": { read: "/projects", write: { method: "POST", path: "/projects", body: {} } },
  "Portfolio": { read: "/projects", write: null, shared: true, note: "Portfolio page reuses /projects" },
  "Workflows": { read: "/workflows", write: { method: "POST", path: "/workflows", body: {} } },
  "Workflow Configuration": { read: "/workflows/templates", write: { method: "POST", path: "/workflows/templates", body: {} } },
  "Approval Hierarchy": { read: "/workflows/templates", write: null, shared: true, note: "reads the same templates endpoint as Workflow Configuration" },
  "Approvals (milestone and workflow)": { read: "/workflows/approvals", write: null },
  "Documents": { read: "/documents", write: { method: "POST", path: "/documents/upload", body: {} } },
  "Document Types": { read: "/reference/document-types", write: null, shared: true, note: "reference list is readable by every signed-in user" },
  "Proposals": { read: "/proposals", write: { method: "POST", path: "/proposals/submit", body: {} } },
  "Activity Logs / Audit Trail": { read: "/audit-logs", write: null },
  "Security Monitoring / System Oversight": { read: "/audit-logs/security-overview", write: null },
  "User Support": { read: null, note: "no support endpoint found in the API" },
  "Reports": { read: "/engineering-reports", write: null, shared: true, note: "mapped to /engineering-reports (no standalone reports endpoint)" },
  "Tasks": { read: "/tasks", write: { method: "POST", path: "/tasks", body: {} } },
  "Issues": { read: "/issues", write: { method: "POST", path: "/issues", body: {} } },
  "RFI / RFA": { read: "/design-requests", write: { method: "POST", path: "/design-requests", body: {} } },
  "Materials and Purchase Requests": { read: "/finance/purchase-requests", write: { method: "POST", path: "/finance/purchase-requests", body: {} } },
  "Employees": { read: "/hr/employees", write: { method: "POST", path: "/hr/employees", body: {} } },
  "Attendance Monitoring": { read: "/hr/attendance", write: null },
  "Attendance Clock-in": { read: null, write: { method: "POST", path: "/attendance", body: {} }, note: "clock-in is a write; probed with an empty body" },
  "Payroll": { read: "/payroll/batches/all", write: { method: "POST", path: "/payroll/generate", body: {} } },
  "Workforce Reports": { read: "/hr/reports/workforce", write: null },
  "Budget": { read: "/finance/budgets", write: { method: "POST", path: "/finance/budgets", body: {} } },
  "Expenses and Vendor Payments": { read: "/finance/expenses", write: { method: "POST", path: "/finance/expenses", body: {} } },
  "Impact Awareness": { read: "/lifecycle/impact", write: null, shared: true },
  "Design Submission": { read: "/designs", write: { method: "POST", path: "/designs", body: {} } },
  "Design Proposal Approval": { read: "/proposals", write: { method: "POST", path: "/proposals/review", body: {} }, shared: true },
  "Revisions": { read: "/design-revisions", write: { method: "POST", path: "/design-revisions", body: {} } },
  "Blueprints": { read: "/blueprints", write: { method: "POST", path: "/blueprints", body: {} } },
  "Progress Reports": { read: "/engineering-reports", write: { method: "POST", path: "/engineering-reports", body: {} } },
  "Requirements": { read: "/requirements", write: { method: "POST", path: "/requirements", body: {} } },
  "Field Documentation": { read: "/documents", write: { method: "POST", path: "/documents/upload", body: {} }, shared: true, note: "field documents are stored in /documents" },
  "Design Repository": { read: "/designs", write: null, shared: true, note: "Consultant 'Designs' screen reads /designs" },
  "Advisory Documents": { read: "/architect-documents", write: { method: "POST", path: "/architect-documents", body: {} }, shared: true },
  "Resources and Tools": { read: null, note: "UI-only page, no API" },
  "Account Recovery (fail-safe)": { read: null, note: "public recovery flow (/auth/owner-recovery/initiate); not role-gated by token" },
};

/** Lifecycle/workflow actions (the ACTION: rows). `state` = the project the probe runs against. */
export interface ActionProbe { state: "Proposal" | "Design" | "none"; method: "POST" | "PATCH"; path: (projectId: number) => string; body?: unknown; note: string }

export const ACTION_API: Record<string, ActionProbe | null> = {
  "ACTION: Advance phase (gate must pass)": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/advance`, body: {}, note: "blocked advance expected (409) for authorised roles" },
  "ACTION: Override a failed gate (reason 10+ chars)": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/advance`, body: { override: true, reason: "short" }, note: "9-char reason: authorised roles get a validation error, others 403" },
  "ACTION: Hold / Resume project": { state: "Design", method: "POST", path: (id) => `/projects/${id}/lifecycle/hold`, body: {}, note: "no reason sent so the project is never held" },
  "ACTION: Cancel project at Proposal": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/cancel`, body: {}, note: "no reason sent so the project is never cancelled" },
  "ACTION: Cancel project after Proposal": { state: "Design", method: "POST", path: (id) => `/projects/${id}/lifecycle/cancel`, body: {}, note: "no reason sent so the project is never cancelled" },
  "ACTION: Archive project": { state: "Proposal", method: "POST", path: (id) => `/projects/${id}/lifecycle/archive`, body: {}, note: "project is not Completed, so authorised roles get 409" },
  "ACTION: Start Project Closeout workflow": { state: "none", method: "POST", path: () => `/workflows`, body: {}, note: "empty body: proves role gate only, if validation runs before the role check every role looks authorised" },
  "ACTION: Send Engineer's RFI/RFA draft (countersign)": { state: "none", method: "POST", path: () => `/design-requests/999999/send`, body: {}, note: "non-existent id: authorised roles get 404" },
  "ACTION: Answer RFI/RFA": { state: "none", method: "POST", path: () => `/design-requests/999999/respond`, body: {}, note: "non-existent id: authorised roles get 404" },
  "ACTION: Mark milestone completed": { state: "none", method: "PATCH", path: () => `/milestones/999999`, body: { status: "completed" }, note: "non-existent id: authorised roles get 404" },
  "ACTION: Build and submit payroll batch": { state: "none", method: "POST", path: () => `/payroll/batches/999999/submit`, body: {}, note: "non-existent id: authorised roles get 404" },
  "ACTION: Approve or return payroll batch": { state: "none", method: "POST", path: () => `/finance/payroll-review/999999/decide`, body: {}, note: "non-existent id / empty body" },
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
