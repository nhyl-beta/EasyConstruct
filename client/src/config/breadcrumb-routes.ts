// Breadcrumb entries for in-app routes that match no Refine resource (the
// resource `create`/`edit`/`show` patterns in providers/resources.ts differ
// from the routes App.tsx really uses, and Refine's own navigation helpers use
// those patterns, so they are left alone). Refine's crumbs always win; this is
// only consulted when Refine returns none. `parent` is a route whose label
// comes from its resource (or another entry here), never typed twice.
//
// Order matters: the first matching pattern wins, so list specific patterns
// before ones with params (`/projects/new` before `/projects/:projectId`).

export interface BreadcrumbRoute {
  pattern: string;
  label: string;
  parent?: string;
}

export const BREADCRUMB_ROUTES: BreadcrumbRoute[] = [
  { pattern: "/", label: "Dashboard" },
  { pattern: "/projects/new", label: "New project", parent: "/projects" },
  // The page passes the project's name as `breadcrumbLabel`; "Project" is the
  // fallback while it loads.
  { pattern: "/projects/:projectId", label: "Project", parent: "/projects" },
  { pattern: "/employees/new", label: "Add employee", parent: "/employees" },
  { pattern: "/employees/:id/edit", label: "Edit employee", parent: "/employees" },
  { pattern: "/settings", label: "Settings" },
  { pattern: "/blueprint-reviews", label: "Blueprint reviews" },
  { pattern: "/transmittals", label: "Transmittals" },
  { pattern: "/consultant/design-reviews", label: "Design reviews" },
];

// Routes that deliberately show no in-app breadcrumb: public auth pages, the public RFI/RFA reply page, the
// 404 page, print pages, redirects and the dev-only design-system page.
export const BREADCRUMB_EXCEPTIONS: string[] = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/reply/:token",
  "/requests/:id/print",
  "/transmittals/:id/print",
  "/ai-insights",
  "/design-system",
  "*",
];
