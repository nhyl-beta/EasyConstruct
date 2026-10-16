import { describe, expect, it } from "vitest";
import { GOVERNANCE_GROUP, ROLE_HIERARCHY, childrenOf, flattenHierarchy, groupParentKey } from "./role-hierarchy";

describe("role hierarchy", () => {
  it("covers each of the ten roles exactly once, with a single root", () => {
    const roles = ROLE_HIERARCHY.map((n) => n.role);
    expect(new Set(roles).size).toBe(10);
    expect(ROLE_HIERARCHY.filter((n) => n.parent === null)).toEqual([{ role: "owner", parent: null }]);
  });

  it("puts Admin and IT Designer side by side under Owner, in one bracket", () => {
    const groups = childrenOf("owner");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.group).toBe(GOVERNANCE_GROUP);
    expect(groups[0]!.nodes.map((n) => n.role)).toEqual(["admin", "it-designer"]);
  });

  it("hangs the three departments from the governance bracket", () => {
    const depts = childrenOf(groupParentKey(GOVERNANCE_GROUP));
    expect(depts.map((d) => d.group)).toEqual(["Project delivery", "People", "Finance"]);
  });

  it("flattens every role for the narrow-screen list", () => {
    expect(flattenHierarchy()).toHaveLength(10);
  });
});
