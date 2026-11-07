"use client";

import {
  Breadcrumb as ShadcnBreadcrumb,
  BreadcrumbItem as ShadcnBreadcrumbItem,
  BreadcrumbList as ShadcnBreadcrumbList,
  BreadcrumbPage as ShadcnBreadcrumbPage,
  BreadcrumbSeparator as ShadcnBreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveTrail } from "@/lib/breadcrumb-trail";
import {
  matchResourceFromRoute,
  useBreadcrumb,
  useLink,
  useResourceParams,
} from "@refinedev/core";
import { Home } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useLocation } from "react-router";
import { useRoleConfig } from "@/hooks/use-role-config";
import { canAccessPath } from "@/config/route-access";

const LINK_CLASS =
  "rounded-sm hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

interface BreadcrumbProps {
  /**
   * Replaces the last crumb: a record's name on a detail page, or the page
   * title ("New project") on a create/edit page, instead of Refine's generic
   * "Show" / "Create" / "Edit".
   */
  label?: string;
}

export function Breadcrumb({ label }: BreadcrumbProps = {}) {
  const Link = useLink();
  const { identity } = useRoleConfig();
  const { pathname } = useLocation();
  const { breadcrumbs } = useBreadcrumb();
  const { resources } = useResourceParams();
  const rootRouteResource = matchResourceFromRoute("/", resources);
  const homeHref = rootRouteResource.matchedRoute ?? "/";

  const trail = useMemo(
    () =>
      resolveTrail({
        refineCrumbs: breadcrumbs.map((b) => ({ label: b.label, href: b.href })),
        pathname,
        labelFor: (route) =>
          matchResourceFromRoute(route, resources).resource?.meta?.label as
            | string
            | undefined,
        lastLabel: label,
      }).map((crumb) => {
        // A crumb is a link only where this role may open it. A role with its own
        // project list (admin, IT Designer) goes there; otherwise the crumb is plain text.
        if (!crumb.href || canAccessPath(identity.role, crumb.href)) return crumb;
        if (crumb.href === "/projects" && canAccessPath(identity.role, "/admin/projects")) {
          return { ...crumb, href: "/admin/projects" };
        }
        return { label: crumb.label };
      }),
    [breadcrumbs, pathname, resources, label, identity.role],
  );

  return (
    <ShadcnBreadcrumb aria-label="Breadcrumb">
      <ShadcnBreadcrumbList>
        <ShadcnBreadcrumbItem>
          <Link to={homeHref} aria-label="Home" className={LINK_CLASS}>
            {rootRouteResource?.resource?.meta?.icon ?? (
              <Home className="h-4 w-4" />
            )}
          </Link>
        </ShadcnBreadcrumbItem>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              <ShadcnBreadcrumbSeparator />
              <ShadcnBreadcrumbItem className="min-w-0">
                {isLast || !crumb.href ? (
                  <ShadcnBreadcrumbPage
                    title={crumb.label}
                    className="block max-w-[min(40ch,70vw)] truncate"
                    {...(isLast ? {} : { "aria-current": undefined })}
                  >
                    {crumb.label}
                  </ShadcnBreadcrumbPage>
                ) : (
                  <Link to={crumb.href} className={LINK_CLASS}>
                    {crumb.label}
                  </Link>
                )}
              </ShadcnBreadcrumbItem>
            </Fragment>
          );
        })}
      </ShadcnBreadcrumbList>
    </ShadcnBreadcrumb>
  );
}

Breadcrumb.displayName = "Breadcrumb";
