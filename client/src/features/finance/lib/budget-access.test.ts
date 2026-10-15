import { describe, expect, it } from "vitest";

import { canReadBudgets } from "./budget-access";

describe("canReadBudgets", () => {
  it("finance readers and the PM may", () => {
    for (const r of ["finance-manager", "finance_manager", "owner", "admin", "it-designer", "it_designer", "project-manager", "project_manager"]) expect(canReadBudgets(r), r).toBe(true);
  });
  it("engineer, architect, consultant, site personnel and HR may not (the server answers 403)", () => {
    for (const r of ["engineer", "architect", "consultant", "site-personnel", "site_personnel", "human-resources", "human_resources", "", undefined, null]) expect(canReadBudgets(r), String(r)).toBe(false);
  });
});
