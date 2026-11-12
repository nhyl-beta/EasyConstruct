import { describe, expect, it } from "vitest";
import { accessibleLink, canAccessPath } from "./route-access";

describe("canAccessPath", () => {
  it("lets a role open the pages of resources it owns", () => {
    expect(canAccessPath("project_manager", "/workflows")).toBe(true);
    expect(canAccessPath("it_designer", "/admin/workflows")).toBe(true);
    expect(canAccessPath("site_personnel", "/tasks")).toBe(true);
    expect(canAccessPath("engineer", "/requirements")).toBe(true);
  });

  it("refuses pages of other roles (B-1, B-2, B-69, B-70, B-220)", () => {
    expect(canAccessPath("it_designer", "/tasks")).toBe(false);
    expect(canAccessPath("it_designer", "/workflows")).toBe(false);
    expect(canAccessPath("human_resources", "/admin/workflows")).toBe(false);
    expect(canAccessPath("project_manager", "/requirements")).toBe(false);
    expect(canAccessPath("finance_manager", "/tasks")).toBe(false);
  });

  it("ignores query and hash, and refuses empty or external targets", () => {
    expect(canAccessPath("it_designer", "/tasks?open=3")).toBe(false);
    expect(canAccessPath("project_manager", "/workflows?open=3")).toBe(true);
    expect(canAccessPath("project_manager", "https://example.com")).toBe(false);
    expect(canAccessPath("project_manager", "")).toBe(false);
    expect(canAccessPath(undefined, "/workflows")).toBe(false);
  });

  it("keeps project creation for the project manager and admin only (B-3)", () => {
    expect(canAccessPath("it_designer", "/projects/new")).toBe(false);
    expect(canAccessPath("it_designer", "/projects/create")).toBe(false);
    expect(canAccessPath("project_manager", "/projects/new")).toBe(true);
    expect(canAccessPath("admin", "/projects/new")).toBe(true);
  });

  it("opens a project's detail page only for roles that have a project list", () => {
    expect(canAccessPath("it_designer", "/projects/PRJ-1")).toBe(true);
    expect(canAccessPath("human_resources", "/projects/PRJ-1")).toBe(false);
  });

  it("leaves unowned shared pages open", () => {
    expect(canAccessPath("human_resources", "/settings")).toBe(true);
    expect(canAccessPath("human_resources", "/dashboard")).toBe(true);
  });

  it("accessibleLink returns null where there is no access", () => {
    expect(accessibleLink("it_designer", "/tasks")).toBeNull();
    expect(accessibleLink("site_personnel", "/tasks")).toBe("/tasks");
  });
});
