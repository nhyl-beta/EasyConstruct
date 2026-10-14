import { describe, expect, it } from "vitest";
import { deleteFilter, loadSavedFilters, MAX_SAVED_FILTERS, saveFilter, storageKey, type FilterStorage } from "./saved-filters";

const memory = (): FilterStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("saved filters", () => {
  it("starts empty and round-trips a saved filter", () => {
    const s = memory();
    expect(loadSavedFilters(1, "hr-attendance", s)).toEqual([]);
    saveFilter(1, "hr-attendance", "Pending only", { verification: "Pending" }, s);
    expect(loadSavedFilters(1, "hr-attendance", s)).toEqual([{ name: "Pending only", values: { verification: "Pending" } }]);
  });

  it("keeps each user's and each page's filters apart", () => {
    const s = memory();
    saveFilter(1, "hr-attendance", "Mine", { a: 1 }, s);
    expect(loadSavedFilters(2, "hr-attendance", s)).toEqual([]);
    expect(loadSavedFilters(1, "hr-employees", s)).toEqual([]);
    expect(storageKey(1, "hr-attendance")).not.toEqual(storageKey(2, "hr-attendance"));
  });

  it("replaces a filter with the same name (ignoring case) and puts it first", () => {
    const s = memory();
    saveFilter(1, "p", "Late", { a: 1 }, s);
    saveFilter(1, "p", "Other", { a: 2 }, s);
    const list = saveFilter(1, "p", "late", { a: 3 }, s);
    expect(list.map((f) => f.name)).toEqual(["late", "Other"]);
    expect(list[0]!.values).toEqual({ a: 3 });
  });

  it("ignores a blank name and caps the list", () => {
    const s = memory();
    expect(saveFilter(1, "p", "   ", { a: 1 }, s)).toEqual([]);
    for (let i = 0; i < MAX_SAVED_FILTERS + 5; i++) saveFilter(1, "p", `f${i}`, { i }, s);
    expect(loadSavedFilters(1, "p", s)).toHaveLength(MAX_SAVED_FILTERS);
  });

  it("deletes by name", () => {
    const s = memory();
    saveFilter(1, "p", "a", {}, s);
    saveFilter(1, "p", "b", {}, s);
    expect(deleteFilter(1, "p", "a", s).map((f) => f.name)).toEqual(["b"]);
  });

  it("survives missing, blocked, full or corrupt storage", () => {
    expect(loadSavedFilters(1, "p", null)).toEqual([]);
    expect(saveFilter(1, "p", "a", {}, null)).toEqual([]);
    const throwing: FilterStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadSavedFilters(1, "p", throwing)).toEqual([]);
    expect(saveFilter(1, "p", "a", {}, throwing)).toEqual([]);
    const corrupt = memory();
    corrupt.data.set(storageKey(1, "p"), "{not json");
    expect(loadSavedFilters(1, "p", corrupt)).toEqual([]);
    corrupt.data.set(storageKey(1, "p"), JSON.stringify([{ nope: true }, { name: "ok", values: {} }]));
    expect(loadSavedFilters(1, "p", corrupt).map((f) => f.name)).toEqual(["ok"]);
  });
});
