import { describe, expect, it } from "vitest";
import { periodLabel } from "./report-status.repository";

describe("periodLabel", () => {
  it("names a day, a week and a month", () => {
    expect(periodLabel("daily", "2026-10-12", "2026-10-12")).toBe("Oct 12");
    expect(periodLabel("weekly", "2026-10-12", "2026-10-18")).toBe("Oct 12 to 18");
    expect(periodLabel("weekly", "2026-10-26", "2026-11-01")).toBe("Oct 26 to Nov 1");
    expect(periodLabel("monthly", "2026-09-01", "2026-09-30")).toBe("Sep 2026");
  });
});
