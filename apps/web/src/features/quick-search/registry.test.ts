import { describe, expect, it } from "vitest";

import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { rankItems } from "./rank";
import {
  ACTIONS,
  actionsFor,
  defaultActionsFor,
  entriesFor,
  pagesFor,
  resourceForRoute,
  roleHasResource,
} from "./registry";
import { ROLES } from "./types";

describe("registry role matrix", () => {
  for (const role of ROLES) {
    describe(role, () => {
      it("only offers actions whose resource the role has", () => {
        for (const a of actionsFor(role)) {
          expect(roleHasResource(role, a.resource), `${a.id} -> ${a.resource}`).toBe(true);
          expect(a.roles).toContain(role);
        }
      });

      it("only offers pages the role's access list allows", () => {
        const allowed = ROLE_RESOURCE_ACCESS[role] ?? [];
        for (const p of pagesFor(role)) {
          const res = resourceForRoute(p.route);
          if (res !== undefined) expect(allowed, `${p.route} -> ${res}`).toContain(res);
        }
      });

      it("has a non-empty default list", () => {
        expect(pagesFor(role).length).toBeGreaterThan(0);
      });

      it("never lists a page twice", () => {
        const routes = pagesFor(role).map((p) => p.route.split("?")[0]);
        expect(new Set(routes).size).toBe(routes.length);
      });
    });
  }

  it("never offers an entry to a role missing from its roles list", () => {
    for (const role of ROLES) {
      for (const a of ACTIONS) {
        if (!a.roles.includes(role)) expect(actionsFor(role)).not.toContain(a);
      }
    }
  });

  it("gives the Owner no data-changing action and no dialog-opening link", () => {
    const owner = actionsFor("owner");
    expect(owner.length).toBeGreaterThan(0);
    for (const a of owner) {
      expect(a.changesData, a.id).toBeFalsy();
      expect(a.route).not.toMatch(/[?&](new|action)=/);
    }
  });

  it("keeps roles away from actions the server refuses them", () => {
    const ids = (r: (typeof ROLES)[number]) => actionsFor(r).map((a) => a.id);
    // issues POST = site-personnel, engineer
    expect(ids("project_manager")).not.toContain("eng:report-issue");
    expect(ids("consultant")).not.toContain("eng:report-issue");
    // tasks POST = project-manager, engineer
    expect(ids("site_personnel")).not.toContain("pm:create-task");
    // projects POST = project-manager, admin
    for (const r of ROLES) {
      if (r !== "project_manager" && r !== "admin") expect(ids(r)).not.toContain("pm:new-project");
    }
    // requests: raisers are project-manager, engineer, admin
    expect(ids("architect")).not.toContain("requests:raise");
    expect(ids("site_personnel")).not.toContain("requests:raise");
  });

  it("offers the Consultant 'Upload advisory' with the ?new=1 convention", () => {
    const up = actionsFor("consultant").find((a) => a.label === "Upload advisory");
    expect(up?.route).toBe("/advisory-docs?new=1");
  });

  it("puts the role's primary action first when it matches an action", () => {
    expect(defaultActionsFor("human_resources")[0]?.id).toBe("hr:add-employee");
    expect(defaultActionsFor("it_designer")[0]?.id).toBe("it:new-user");
    expect(defaultActionsFor("project_manager")[0]?.id).toBe("pm:new-project");
  });
});

describe("registry search", () => {
  it("Consultant: 'upl' finds Upload advisory first", () => {
    expect(rankItems(entriesFor("consultant"), "upl")[0]?.label).toBe("Upload advisory");
  });
  it("PM: 'new pro' finds New project", () => {
    const labels = rankItems(entriesFor("project_manager"), "new pro").map((e) => e.label);
    expect(labels).toContain("New project");
  });
  it("Site Personnel: 'clock' finds attendance", () => {
    const out = rankItems(entriesFor("site_personnel"), "clock");
    expect(out.some((e) => e.route.startsWith("/attendance"))).toBe(true);
  });
  it("synonyms: salary run reaches Generate payroll, pay finds payroll pages", () => {
    const hr = entriesFor("human_resources");
    expect(rankItems(hr, "salary run").some((e) => e.id === "hr:generate-payroll")).toBe(true);
    expect(rankItems(hr, "pay").length).toBeGreaterThan(0);
  });
  it("'rfi' and 'approve' reach Requests and Approvals", () => {
    expect(rankItems(entriesFor("engineer"), "rfi").some((e) => e.route.startsWith("/requests"))).toBe(true);
    expect(rankItems(entriesFor("finance_manager"), "approve").some((e) => e.route === "/approvals")).toBe(true);
  });
});
