import { describe, expect, it } from "vitest";

import { breakdownTotal, formatBreakdownText, hasCostBreakdown, type CostBreakdownRow } from "./cost-breakdown-input";

const row = (description: string, quantity: string, unit: string, unitCost: string): CostBreakdownRow => ({
  id: description || Math.random().toString(),
  description,
  quantity,
  unit,
  unitCost,
});

describe("cost breakdown math", () => {
  it("sums only rows with a description, a unit, a positive quantity and a positive unit cost", () => {
    const rows = [
      row("Steel framing", "120", "kg", "3500"),
      row("", "10", "pcs", "500"),
      row("Site mobilization", "1", "lot", "0"),
      row("Rebar", "2", "", "15000"),
      row("Permits", "1", "l.s.", "25000"),
    ];
    expect(breakdownTotal(rows)).toBe(120 * 3500 + 1 * 25000);
  });

  it("an all-empty breakdown has no proof behind it", () => {
    expect(hasCostBreakdown([row("", "", "", "")])).toBe(false);
    expect(breakdownTotal([row("", "", "", "")])).toBe(0);
  });

  it("a row with no unit does not count, even if everything else is filled in", () => {
    expect(hasCostBreakdown([row("Rebar", "2", "", "15000")])).toBe(false);
  });

  it("one real line item is enough", () => {
    expect(hasCostBreakdown([row("", "", "", ""), row("Rebar", "2", "kg", "15000")])).toBe(true);
  });

  it("renders each line with its unit and the computed total, skipping incomplete rows", () => {
    const text = formatBreakdownText([row("Rebar", "2", "kg", "15000"), row("", "5", "pcs", "100"), row("Cement", "3", "", "200")]);
    expect(text).toContain("Cost breakdown:");
    expect(text).toContain("Rebar — 2 kg × ₱15,000.00/kg");
    expect(text).not.toContain("5 pcs ×");
    expect(text).not.toContain("Cement");
    expect(text).toMatch(/Estimated amount \(computed\): .*30,000/);
  });

  it("an empty breakdown renders nothing to fold into the description", () => {
    expect(formatBreakdownText([row("", "", "", "")])).toBe("");
  });
});
