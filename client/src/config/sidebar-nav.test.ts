import { describe, expect, it } from "vitest";

import { resources } from "@/providers/resources";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import {
  SIDEBAR_NAV,
  buildSidebarNav,
  hasSidebarNavConfig,
  type SidebarNavEntry,
} from "./sidebar-nav";

type Res = { name: string };

// What the sidebar hands in: every registered resource, in registry order
// (useMenu); buildSidebarNav does the role filtering itself as well.
const registered: Res[] = resources.map((r) => ({ name: r.name }));

const flatNames = (entries: SidebarNavEntry<Res>[]) =>
  entries.flatMap((e) => (e.kind === "item" ? [e.item.name] : e.items.map((i) => i.name)));

const granted = (role: string) =>
  registered.map((r) => r.name).filter((n) => (ROLE_RESOURCE_ACCESS[role] ?? []).includes(n));

describe("buildSidebarNav", () => {
  for (const role of Object.keys(ROLE_RESOURCE_ACCESS)) {
    describe(role, () => {
      const entries = buildSidebarNav(role, registered);

      it("shows every granted, registered resource exactly once", () => {
        expect([...flatNames(entries)].sort()).toEqual([...granted(role)].sort());
      });

      it("never shows a resource the role is not granted", () => {
        const allowed = ROLE_RESOURCE_ACCESS[role];
        for (const n of flatNames(entries)) expect(allowed).toContain(n);
      });

      it("never renders a group with fewer than 2 children", () => {
        for (const e of entries) if (e.kind === "group") expect(e.items.length).toBeGreaterThanOrEqual(2);
      });

      it("puts Dashboard first", () => {
        const first = entries[0];
        expect(first.kind === "item" && first.item.name).toBe("dashboard");
      });

      it("keeps Approvals top-level where granted", () => {
        if (!ROLE_RESOURCE_ACCESS[role].includes("approvals")) return;
        expect(entries.some((e) => e.kind === "item" && e.item.name === "approvals")).toBe(true);
      });

      it("keeps the AI reference top-level where it is registered", () => {
        const group = entries.find(
          (e) => e.kind === "group" && e.items.some((i) => i.name === "ai-validation-reference"),
        );
        expect(group).toBeUndefined();
      });
    });
  }

  it("leaves roles without a config flat, in registry order", () => {
    for (const role of Object.keys(ROLE_RESOURCE_ACCESS)) {
      if (hasSidebarNavConfig(role)) continue;
      const entries = buildSidebarNav(role, registered);
      expect(entries.every((e) => e.kind === "item")).toBe(true);
      expect(flatNames(entries)).toEqual(granted(role));
    }
  });

  it("only configures the four crowded roles", () => {
    expect(Object.keys(SIDEBAR_NAV).sort()).toEqual(["admin", "architect", "it_designer", "project_manager"]);
  });

  it("appends granted resources missing from the config instead of dropping them", () => {
    const extra: Res[] = [...registered, { name: "future-resource" }];
    const original = ROLE_RESOURCE_ACCESS.admin;
    ROLE_RESOURCE_ACCESS.admin = [...original, "future-resource"];
    try {
      const entries = buildSidebarNav("admin", extra);
      const last = entries[entries.length - 1];
      expect(last.kind === "item" && last.item.name).toBe("future-resource");
    } finally {
      ROLE_RESOURCE_ACCESS.admin = original;
    }
  });

  it("flattens a group left with a single visible child", () => {
    const only = registered.filter((r) => r.name !== "admin-security" && r.name !== "admin-roles-permissions");
    const entries = buildSidebarNav("admin", only);
    expect(entries.some((e) => e.kind === "group" && e.id === "security-administration")).toBe(false);
    expect(flatNames(entries)).toContain("admin-activity-logs");
  });

  // Section 5 regression: top-level counts, excluding the flag-gated AI reference.
  const topLevel = (role: string) =>
    buildSidebarNav(role, registered).filter((e) => !(e.kind === "item" && e.item.name === "ai-validation-reference"));

  it.each([
    ["admin", 7],
    ["it_designer", 6],
    ["project_manager", 8],
    ["architect", 6],
  ])("%s shows %i top-level entries", (role, count) => {
    expect(topLevel(role)).toHaveLength(count);
  });

  it("groups the children listed in the target structure", () => {
    const shape = (role: string) =>
      Object.fromEntries(
        buildSidebarNav(role, registered)
          .filter((e) => e.kind === "group")
          .map((e) => [e.kind === "group" ? e.label : "", e.kind === "group" ? e.items.map((i) => i.name) : []]),
      );
    expect(shape("admin")).toEqual({
      "Workflow Management": ["admin-workflows", "admin-workflow-configuration", "admin-approval-hierarchy"],
      "Security & Administration": ["admin-activity-logs", "admin-security", "admin-roles-permissions"],
      Records: ["requests", "archive-search", "legacy-import"],
    });
    expect(shape("it_designer")).toEqual({
      "User & Access": ["it-designer-users", "it-designer-roles-permissions"],
      "Operations Oversight": ["admin-projects", "admin-documents", "it-designer-proposals"],
      "Workflow Management": ["admin-workflows", "admin-workflow-configuration", "admin-approval-hierarchy"],
      "Security & Audit": ["it-designer-activity-logs", "it-designer-security"],
    });
    expect(shape("project_manager")).toEqual({
      "Project Delivery": ["issues", "tasks", "reports"],
      "Records & Requests": ["requests", "archive-search", "legacy-import"],
    });
    expect(shape("architect")).toEqual({
      "Designs & Proposals": ["designs", "proposals"],
      "Design Files": ["blueprints", "revisions", "architect-documents"],
      "Records & Requests": ["requests", "archive-search", "legacy-import"],
    });
  });
});
