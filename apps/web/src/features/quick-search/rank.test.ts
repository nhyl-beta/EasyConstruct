import { describe, expect, it } from "vitest";

import { capPerGroup, normalize, parseQuery, rankItems, scoreItem } from "./rank";
import type { Rankable } from "./types";

const item = (label: string, kind: Rankable["kind"], keywords: string[] = []): Rankable => ({ label, kind, keywords });

describe("parseQuery", () => {
  it("treats a leading > as actions-only", () => {
    expect(parseQuery(">new pro")).toEqual({ actionsOnly: true, text: "new pro" });
    expect(parseQuery("  > Upload ")).toEqual({ actionsOnly: true, text: "upload" });
    expect(parseQuery("new pro").actionsOnly).toBe(false);
  });
  it("normalizes case, accents and spacing", () => {
    expect(normalize("  Café   PLAN ")).toBe("cafe plan");
  });
});

describe("scoreItem", () => {
  it("orders prefix > word prefix > substring > keyword", () => {
    const prefix = scoreItem("pro", item("Projects", "page"));
    const word = scoreItem("pro", item("New project", "action"));
    const sub = scoreItem("ject", item("Projects", "page"));
    const keyword = scoreItem("salary", item("Payroll", "page", ["salary run"]));
    expect(prefix).toBeGreaterThan(word!);
    expect(word).toBeGreaterThan(sub!);
    expect(sub).toBeGreaterThan(keyword!);
  });
  it("returns null when nothing matches", () => {
    expect(scoreItem("zzz", item("Projects", "page", ["work"]))).toBeNull();
  });
  it("matches a multi-word query across words", () => {
    expect(scoreItem("new pro", item("New project", "action"))).not.toBeNull();
    expect(scoreItem("new pro", item("New proposal", "action"))).not.toBeNull();
    expect(scoreItem("new pro", item("Payroll", "page"))).toBeNull();
  });
  it("matches synonyms", () => {
    expect(scoreItem("pay", item("Payroll review", "page", ["pay", "salary run"]))).not.toBeNull();
    expect(scoreItem("salary", item("Generate payroll", "action", ["salary run"]))).not.toBeNull();
    expect(scoreItem("rfi", item("Requests", "page", ["rfi", "rfa"]))).not.toBeNull();
    expect(scoreItem("approve", item("Approvals", "page", ["approve"]))).not.toBeNull();
  });
});

describe("rankItems", () => {
  it("puts prefix matches before substring matches", () => {
    const out = rankItems([item("Reports", "page"), item("Workforce reports", "page"), item("Preport", "page")], "rep");
    expect(out.map((i) => i.label)).toEqual(["Reports", "Workforce reports", "Preport"]);
  });
  it("ranks actions above pages above records at the same score", () => {
    const out = rankItems([item("Budget", "record"), item("Budget", "page"), item("Budget", "action")], "bud");
    expect(out.map((i) => i.kind)).toEqual(["action", "page", "record"]);
  });
  it("a better score beats a better kind", () => {
    const out = rankItems([item("Open budgets", "action"), item("Budget", "record")], "bud");
    expect(out[0]?.label).toBe("Budget");
  });
  it("returns everything for an empty query", () => {
    expect(rankItems([item("A", "page"), item("B", "action")], "")).toHaveLength(2);
  });
});

describe("capPerGroup", () => {
  it("keeps at most N per group", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ g: i % 2 ? "a" : "b", i }));
    const out = capPerGroup(rows, (r) => r.g, 3);
    expect(out.filter((r) => r.g === "a")).toHaveLength(3);
    expect(out.filter((r) => r.g === "b")).toHaveLength(3);
  });
});
