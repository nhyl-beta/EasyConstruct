import { describe, expect, it } from "vitest";

import { breakdownTotal, formatBreakdownText, hasCostBreakdown, type CostBreakdownRow } from "./cost-breakdown-input";

const row = (description: string, quantity: string, unitCost: string): CostBreakdownRow => ({
  id: description,
  description,
  quantity,
  unitCost,
});

describe("cost breakdown math", () => {
  it("sums only rows with a description, a positive quantity and a positive unit cost", () => {
    const rows = [row("Steel framing", "120", "3500"), row("", "10", "500"), row("Site mobilization", "1", "0"), row("Permits", "1", "25000")];
    expect(breakdownTotal(rows)).toBe(120 * 3500 + 1 * 25000);
  });

  it("an all-empty breakdown has no proof behind it", () => {
    expect(hasCostBreakdown([row("", "", "")])).toBe(false);
    expect(breakdownTotal([row("", "", "")])).toBe(0);
  });

  it("one real line item is enough", () => {
    expect(hasCostBreakdown([row("", "", ""), row("Rebar", "2", "15000")])).toBe(true);
  });

  it("renders each line and the computed total, skipping incomplete rows", () => {
    const text = formatBreakdownText([row("Rebar", "2", "15000"), row("", "5", "100")]);
    expect(text).toContain("Cost breakdown:");
    expect(text).toContain("Rebar — 2 ×");
    expect(text).not.toContain("5 ×");
    expect(text).toMatch(/Estimated amount \(computed\): .*30,000/);
  });

  it("an empty breakdown renders nothing to fold into the description", () => {
    expect(formatBreakdownText([row("", "", "")])).toBe("");
  });
});
