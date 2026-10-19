// apps/web/src/lib/query-keys.ts
//
// Every query key in one place. All keys are  ["api", <resource>, ...]  where
// <resource> is the first segment of the API path ("projects", "workflows"…):
// that shape is what lets a write invalidate exactly the resources it can have
// changed (see query-invalidation.ts) without knowing which screens are open.
export type Params = Record<string, unknown>;

const api = <R extends string, T extends readonly unknown[]>(resource: R, ...rest: T) => ["api", resource, ...rest] as const;

export const qk = {
  dashboard: { summary: api("dashboard", "summary"), workforce: api("dashboard", "workforce") },
  approvals: {
    stats: api("workflows", "approvals", "stats"),
    queue: (scope: string, params?: Params) => api("workflows", "approvals", "queue", scope, params ?? {}),
  },
  projects: {
    all: api("projects"),
    list: (params: Params) => api("projects", "list", params),
    one: (idOrCode: string) => api("projects", "one", idOrCode),
  },
  employees: {
    all: api("employees"),
    list: (params: Params) => api("employees", "list", params),
    me: api("employees", "me"),
  },
  attendance: {
    all: api("attendance"),
    list: (params: Params) => api("attendance", "list", params),
    employee: (employeeId: string | null) => api("attendance", "employee", employeeId),
  },
  payroll: {
    all: api("payroll"),
    lines: (params: Params) => api("payroll", "lines", params),
    batches: (params?: Params) => api("payroll", "batches", params ?? {}),
    summary: (months: number) => api("payroll", "summary", months),
  },
  documents: { all: api("documents"), list: (params: Params) => api("documents", "list", params) },
  proposals: { all: api("proposals"), list: (params: Params) => api("proposals", "list", params) },
  designs: { all: api("designs"), list: (params: Params) => api("designs", "list", params) },
  workflows: {
    all: api("workflows"),
    list: (params: Params) => api("workflows", "list", params),
    templates: api("workflows", "templates"),
  },
  tasks: { all: api("tasks"), list: (params: Params) => api("tasks", "list", params) },
  issues: { all: api("issues"), list: (params: Params) => api("issues", "list", params) },
  requirements: { all: api("requirements"), list: (params: Params) => api("requirements", "list", params) },
  reports: { all: api("engineering-reports"), list: (params: Params) => api("engineering-reports", "list", params) },
  users: { all: api("users"), list: (params: Params) => api("users", "list", params) },
  roles: { all: api("roles") },
  audit: { all: api("audit-logs"), list: (params: Params) => api("audit-logs", "list", params) },
  finance: {
    all: api("finance"),
    expenses: (params: Params) => api("finance", "expenses", params),
    payrollReview: (params: Params) => api("finance", "payroll-review", params),
  },
  lifecycle: { myActions: api("lifecycle", "my-actions"), impact: api("lifecycle", "impact") },
  calendar: { events: (from: string, to: string) => api("calendar", "events", { from, to }) },
} as const;

/** "/projects/12?x=1" -> "projects" */
export const resourceOf = (path: string): string => path.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
