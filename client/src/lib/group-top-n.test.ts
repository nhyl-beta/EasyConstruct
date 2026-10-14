import { describe, expect, it } from "vitest";

import { groupTopN } from "./group-top-n";

const total = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);

describe("groupTopN", () => {
  it("returns an empty list for empty input", () => {
    expect(groupTopN([], 6)).toEqual([]);
  });

  it("sorts largest first and adds no Other when there are n or fewer names", () => {
    const out = groupTopN([{ name: "B", value: 2 }, { name: "A", value: 5 }], 6);
    expect(out).toEqual([{ name: "A", value: 5 }, { name: "B", value: 2 }]);
    expect(groupTopN([{ name: "A", value: 1 }, { name: "B", value: 2 }], 2).map((s) => s.name)).toEqual(["B", "A"]);
  });

  it("sums rows that share a name before ranking (a project listed several times)", () => {
    const out = groupTopN(
      [{ name: "DEMO-S3", value: 100 }, { name: "DEMO-S1", value: 150 }, { name: "DEMO-S3", value: 100 }],
      6,
    );
    expect(out).toEqual([{ name: "DEMO-S3", value: 200 }, { name: "DEMO-S1", value: 150 }]);
  });

  it("folds the rest into one Other slice whose value is exactly the remainder", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, value: 100 - i }));
    const out = groupTopN(rows, 6);
    expect(out).toHaveLength(7);
    expect(out.slice(0, 6).map((s) => s.name)).toEqual(["P0", "P1", "P2", "P3", "P4", "P5"]);
    expect(out[6]).toEqual({ name: "Other", value: 94 + 93 + 92 });
  });

  it("preserves the total", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ name: `P${i}`, value: i + 1 }));
    expect(total(groupTopN(rows, 6))).toBe(total(rows));
    expect(total(groupTopN(rows, 20))).toBe(total(rows));
  });

  it("keeps input order for ties", () => {
    const out = groupTopN([{ name: "x", value: 5 }, { name: "y", value: 5 }, { name: "z", value: 5 }], 2);
    expect(out.map((s) => s.name)).toEqual(["x", "y", "Other"]);
    expect(out[2].value).toBe(5);
  });

  it("drops zero and negative values and honours a custom label", () => {
    const out = groupTopN(
      [{ name: "a", value: 0 }, { name: "b", value: -3 }, { name: "c", value: 4 }, { name: "d", value: 3 }],
      1,
      "Everything else",
    );
    expect(out).toEqual([{ name: "c", value: 4 }, { name: "Everything else", value: 3 }]);
  });
});
