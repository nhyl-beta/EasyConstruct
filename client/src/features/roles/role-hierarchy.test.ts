import { describe, expect, it } from "vitest";
import { GOVERNANCE_GROUP, ROLE_HIERARCHY, childrenOf, flattenHierarchy, groupParentKey } from "./role-hierarchy";
import { CARD_H, CARD_W, GAP_X, computeRoleLayout, neighbour } from "./role-layout";

describe("role hierarchy config", () => {
  it("covers each of the ten roles exactly once, with a single root", () => {
    expect(new Set(ROLE_HIERARCHY.map((n) => n.role)).size).toBe(10);
    expect(ROLE_HIERARCHY.filter((n) => n.parent === null).map((n) => n.role)).toEqual(["owner"]);
  });

  it("puts Admin and IT Designer side by side under Owner, in one group", () => {
    const kids = childrenOf("owner");
    expect(kids.map((n) => n.role)).toEqual(["admin", "it-designer"]);
    expect(new Set(kids.map((n) => n.group))).toEqual(new Set([GOVERNANCE_GROUP]));
  });

  it("hangs the three department leads from the governance pair", () => {
    expect(childrenOf(groupParentKey(GOVERNANCE_GROUP)).map((n) => n.group)).toEqual(["People", "Project delivery", "Finance"]);
  });

  it("flattens every role for the narrow-screen list", () => {
    expect(flattenHierarchy()).toHaveLength(10);
  });
});

describe("role layout", () => {
  const layout = computeRoleLayout();
  const n = layout.nodes;

  it("places Admin and IT Designer on the same row, one card gap apart", () => {
    expect(n.admin!.top).toBe(n["it-designer"]!.top);
    expect(n["it-designer"]!.left - (n.admin!.left + CARD_W)).toBe(GAP_X);
  });

  it("centres Owner and the governance pair over the department leads", () => {
    const mid = (n.admin!.cx + n["it-designer"]!.cx) / 2;
    expect(n.owner!.cx).toBeCloseTo(mid, 3);
    expect(n["project-manager"]!.cx).toBeCloseTo(mid, 3);
  });

  it("is horizontally symmetric: People and Finance flank Project delivery equally", () => {
    const pm = n["project-manager"]!.cx;
    expect(pm - n["human-resources"]!.cx).toBeCloseTo(n["finance-manager"]!.cx - pm, 3);
  });

  it("keeps cards on one tier per row and never overlapping within a row", () => {
    const rows = new Map<number, number[]>();
    for (const node of Object.values(n)) rows.set(node.top, [...(rows.get(node.top) ?? []), node.left]);
    expect(rows.size).toBe(5);
    for (const lefts of rows.values()) {
      const sorted = [...lefts].sort((a, b) => a - b);
      sorted.slice(1).forEach((l, i) => expect(l - sorted[i]!).toBeGreaterThanOrEqual(CARD_W));
    }
    expect(CARD_H).toBeGreaterThan(0);
  });

  it("keeps the group boxes apart", () => {
    const g = [...layout.groups].sort((a, b) => a.left - b.left);
    for (const [i, box] of g.entries()) {
      for (const other of g.slice(i + 1)) {
        const apart = box.left + box.width <= other.left || other.left + other.width <= box.left || box.top + box.height <= other.top || other.top + other.height <= box.top;
        expect(apart).toBe(true);
      }
    }
  });

  it("highlights the path from Owner through the governance pair", () => {
    expect(layout.pathTo("engineer")).toEqual(expect.arrayContaining(["engineer", "project-manager", "gov", "owner"]));
    expect(layout.edges.some((e) => e.child === "gov")).toBe(true);
  });

  it("moves with the arrow keys: up to the parent, down to a child, sideways along the row", () => {
    expect(neighbour(layout, "architect", "ArrowUp")).toBe("project-manager");
    expect(neighbour(layout, "project-manager", "ArrowDown")).toBe("engineer");
    expect(neighbour(layout, "admin", "ArrowRight")).toBe("it-designer");
    expect(neighbour(layout, "owner", "ArrowUp")).toBeNull();
    expect(neighbour(layout, "owner", "ArrowDown")).toBe("admin");
  });
});
