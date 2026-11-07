import { describe, expect, it } from "vitest";
import { entityGroup, groupEntityTypes } from "./entity-groups";

describe("entity groups", () => {
  it("puts known types under their heading and unknown ones under Other", () => {
    expect(entityGroup("task")).toBe("Projects & delivery");
    expect(entityGroup("payroll_batch")).toBe("Finance & payroll");
    expect(entityGroup("something_new")).toBe("Other");
  });
  it("keeps every type exactly once, headings in order, Other last", () => {
    const types = ["user", "task", "zzz", "budget", "file"];
    const groups = groupEntityTypes(types);
    expect(groups.flatMap((g) => g.types).sort()).toEqual([...types].sort());
    expect(groups.at(-1)?.group).toBe("Other");
  });
});
