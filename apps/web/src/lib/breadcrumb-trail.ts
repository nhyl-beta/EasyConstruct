import { matchPath } from "react-router";

import { BREADCRUMB_ROUTES, type BreadcrumbRoute } from "@/config/breadcrumb-routes";

export interface Crumb {
  label: string;
  href?: string;
}

const normalise = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

const entryFor = (pathname: string, routes: BreadcrumbRoute[]) =>
  routes.find((r) => matchPath({ path: r.pattern, end: true }, pathname));

/**
 * The crumbs for a route no resource matched, from the fallback list. `labelFor`
 * gives the label of a parent route (normally the Refine resource's
 * `meta.label`). The last crumb has no href.
 */
export function fallbackTrail(
  pathname: string,
  labelFor: (route: string) => string | undefined,
  routes: BreadcrumbRoute[] = BREADCRUMB_ROUTES,
): Crumb[] {
  const entry = entryFor(normalise(pathname), routes);
  if (!entry) return [];

  const parents: Crumb[] = [];
  let parent = entry.parent;
  // Bounded so a config typo can never loop.
  for (let depth = 0; parent && depth < 5; depth++) {
    const own = routes.find((r) => r.pattern === parent);
    const label = own?.label ?? labelFor(parent);
    if (label) parents.unshift({ label, href: parent });
    parent = own?.parent;
  }
  return [...parents, { label: entry.label }];
}

/**
 * Which crumbs to show after the home icon: Refine's when it has any, else the
 * fallback list. `lastLabel` (a record's name, or "New project") replaces the
 * label of the last crumb, which is never a link.
 */
export function resolveTrail({
  refineCrumbs,
  pathname,
  labelFor,
  lastLabel,
}: {
  refineCrumbs: Crumb[];
  pathname: string;
  labelFor: (route: string) => string | undefined;
  lastLabel?: string;
}): Crumb[] {
  const base = refineCrumbs.length > 0 ? refineCrumbs : fallbackTrail(pathname, labelFor);
  if (base.length === 0) return lastLabel ? [{ label: lastLabel }] : [];

  const trail = base.map((c, i) => (i === base.length - 1 ? { label: c.label } : { ...c }));
  if (lastLabel) trail[trail.length - 1] = { label: lastLabel };
  return trail;
}
