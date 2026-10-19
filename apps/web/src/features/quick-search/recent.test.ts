import { describe, expect, it } from "vitest";

import { pushRecent, readRecent, RECENT_LIMIT, type RecentItem } from "./recent";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const item = (n: number): RecentItem => ({ key: `page:/p${n}`, label: `Page ${n}`, route: `/p${n}`, kind: "page" });

describe("recent", () => {
  it("keeps the newest items first and caps the list", () => {
    const s = memory();
    for (let i = 1; i <= RECENT_LIMIT + 3; i++) pushRecent("u1", item(i), s);
    const list = readRecent("u1", s);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]?.key).toBe(`page:/p${RECENT_LIMIT + 3}`);
  });

  it("moves a repeated choice to the top instead of duplicating it", () => {
    const s = memory();
    pushRecent("u1", item(1), s);
    pushRecent("u1", item(2), s);
    pushRecent("u1", item(1), s);
    expect(readRecent("u1", s).map((r) => r.key)).toEqual(["page:/p1", "page:/p2"]);
  });

  it("is per user", () => {
    const s = memory();
    pushRecent("u1", item(1), s);
    expect(readRecent("u2", s)).toEqual([]);
  });

  it("ignores corrupt stored data", () => {
    const s = memory();
    s.setItem("easyconstruct:quick-search:recent:u1", "{not json");
    expect(readRecent("u1", s)).toEqual([]);
    s.setItem("easyconstruct:quick-search:recent:u1", JSON.stringify([{ nope: 1 }, item(1)]));
    expect(readRecent("u1", s)).toHaveLength(1);
  });

  it("works when storage is missing or throws", () => {
    expect(readRecent("u1", null)).toEqual([]);
    expect(pushRecent("u1", item(1), null)).toHaveLength(1);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readRecent("u1", blocked)).toEqual([]);
    expect(pushRecent("u1", item(1), blocked)).toHaveLength(1);
  });
});
