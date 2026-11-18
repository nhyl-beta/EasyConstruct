import { describe, expect, it } from "vitest";
import { payrollPeriod } from "./payroll-cycle";

describe("payrollPeriod", () => {
  it("monthly keeps the month label and covers the whole month", () => {
    expect(payrollPeriod("2026-02", "monthly")).toEqual({ label: "2026-02", from: "2026-02-01", to: "2026-02-28" });
  });
  it("semi-monthly halves are 1st-15th and 16th-end, labelled as a date range", () => {
    expect(payrollPeriod("2026-11", "first-half")).toEqual({ label: "2026-11-01 to 2026-11-15", from: "2026-11-01", to: "2026-11-15" });
    expect(payrollPeriod("2026-11", "second-half")).toEqual({ label: "2026-11-16 to 2026-11-30", from: "2026-11-16", to: "2026-11-30" });
  });
  it("an unreadable month passes through without dates", () => {
    expect(payrollPeriod("", "first-half")).toEqual({ label: "" });
  });
});
