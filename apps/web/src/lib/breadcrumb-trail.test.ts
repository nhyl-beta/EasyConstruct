import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchResourceFromRoute } from "@refinedev/core";
import { describe, expect, it } from "vitest";

import { BREADCRUMB_EXCEPTIONS, BREADCRUMB_ROUTES } from "@/config/breadcrumb-routes";
import { resources } from "@/providers/resources";
import { fallbackTrail, resolveTrail } from "./breadcrumb-trail";

const matchRoute = (route: string) => matchResourceFromRoute(route, resources);
const labelFor = (route: string) =>
  matchRoute(route).resource?.meta?.label as string | undefined;
const labels = (route: string) => fallbackTrail(route, labelFor).map((c) => c.label);

describe("fallback trail for routes no resource matches (F4)", () => {
  it.each([
    ["/", ["Dashboard"]],
    ["/projects/new", ["Projects", "New project"]],
    ["/projects/42", ["Projects", "Project"]],
    ["/employees/new", ["Employees", "Add employee"]],
    ["/employees/7/edit", ["Employees", "Edit employee"]],
    ["/blueprint-reviews", ["Blueprint reviews"]],
    ["/transmittals", ["Transmittals"]],
    ["/consultant/design-reviews", ["Design reviews"]],
  ])("%s", (route, expected) => {
    expect(matchRoute(route).resource, `${route} should match no resource`).toBeUndefined();
    expect(labels(route)).toEqual(expected);
  });

  it("links every crumb but the last, and takes parent labels from the resource", () => {
    const trail = fallbackTrail("/projects/new", labelFor);
    expect(trail[0]).toEqual({ label: labelFor("/projects"), href: "/projects" });
    expect(trail[1].href).toBeUndefined();
  });

  it("labels '/' like the Dashboard resource, so the two never drift", () => {
    expect(labels("/")).toEqual([labelFor("/dashboard")]);
  });

  it("returns nothing for an unlisted route", () => {
    expect(labels("/nowhere")).toEqual([]);
  });
});

describe("resolveTrail", () => {
  const refineCrumbs = [{ label: "Designs", href: "/designs" }, { label: "Show" }];

  it("prefers Refine's crumbs over the fallback", () => {
    const trail = resolveTrail({ refineCrumbs, pathname: "/projects/new", labelFor });
    expect(trail.map((c) => c.label)).toEqual(["Designs", "Show"]);
  });

  it("shows the record's name instead of 'Show'", () => {
    const trail = resolveTrail({ refineCrumbs, pathname: "/designs/5", labelFor, lastLabel: "Tower A facade" });
    expect(trail).toEqual([{ label: "Designs", href: "/designs" }, { label: "Tower A facade" }]);
  });

  it("shows the create title instead of 'Create'", () => {
    const trail = resolveTrail({
      refineCrumbs: [{ label: "Projects", href: "/projects" }, { label: "Create" }],
      pathname: "/projects/create",
      labelFor,
      lastLabel: "New project",
    });
    expect(trail.map((c) => c.label)).toEqual(["Projects", "New project"]);
  });

  it("applies lastLabel to the fallback trail too", () => {
    const trail = resolveTrail({ refineCrumbs: [], pathname: "/projects/42", labelFor, lastLabel: "Harbour Tower" });
    expect(trail).toEqual([{ label: "Projects", href: "/projects" }, { label: "Harbour Tower" }]);
  });

  it("never links the last crumb", () => {
    const trail = resolveTrail({
      refineCrumbs: [{ label: "Projects", href: "/projects" }],
      pathname: "/projects",
      labelFor,
    });
    expect(trail[trail.length - 1].href).toBeUndefined();
  });

  it("leaves a trail untouched when no lastLabel is passed", () => {
    const trail = resolveTrail({ refineCrumbs: [{ label: "Projects" }], pathname: "/projects", labelFor });
    expect(trail).toEqual([{ label: "Projects" }]);
  });
});

describe("every App.tsx route gets a breadcrumb", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  // `:param` -> a value, the way a real URL looks.
  const concrete = (route: string) => route.replace(/:\w+/g, "1");

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it.each([...new Set(routes)])("%s", (route) => {
    if (BREADCRUMB_EXCEPTIONS.includes(route)) return;
    const url = concrete(route);
    const byResource = matchRoute(url).resource !== undefined;
    const byFallback = fallbackTrail(url, labelFor).length > 0;
    expect(
      byResource || byFallback,
      `${route} matches no resource, is not in BREADCRUMB_ROUTES and is not in BREADCRUMB_EXCEPTIONS`,
    ).toBe(true);
  });

  it("keeps the exception list honest: each entry is a real route", () => {
    for (const e of BREADCRUMB_EXCEPTIONS) {
      // /design-system is mounted conditionally, so it is allowed to be absent.
      expect(routes.includes(e) || e === "/design-system", e).toBe(true);
    }
  });

  it("has no fallback entry that a resource already covers", () => {
    for (const r of BREADCRUMB_ROUTES) {
      if (r.pattern === "/") continue; // '/' is the Dashboard alias, covered by no resource
      expect(matchRoute(concrete(r.pattern)).resource, r.pattern).toBeUndefined();
    }
  });
});
