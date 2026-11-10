import { afterEach, describe, expect, it, vi } from "vitest";
import { todayIso } from "./today-iso";

describe("todayIso", () => {
  afterEach(() => vi.useRealTimers());

  it("formats the local date as yyyy-MM-dd with zero padding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59));
    expect(todayIso()).toBe("2026-01-05");
  });
});
