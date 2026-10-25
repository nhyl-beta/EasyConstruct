import { describe, expect, it } from "vitest";
import {
  MILESTONE_DATE_PAST_MESSAGE,
  milestoneDateError,
  milestoneRedateError,
  todayManilaIso,
} from "./milestone-date";

describe("milestoneDateError", () => {
  const today = "2026-10-12";
  it("rejects a past date, including one typed by keyboard", () => {
    expect(milestoneDateError("2026-10-11", today)).toBe(MILESTONE_DATE_PAST_MESSAGE);
    expect(milestoneDateError("2020-01-01", today)).toBe(MILESTONE_DATE_PAST_MESSAGE);
  });
  it("accepts today and future dates", () => {
    expect(milestoneDateError("2026-10-12", today)).toBeNull();
    expect(milestoneDateError("2026-10-13", today)).toBeNull();
  });
  it("treats an empty date as fine (the date is optional)", () => {
    expect(milestoneDateError("", today)).toBeNull();
  });
});

describe("todayManilaIso", () => {
  it("uses the Manila day across midnight", () => {
    expect(todayManilaIso(new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-12");
    expect(todayManilaIso(new Date("2026-10-12T15:59:00Z"))).toBe("2026-10-12");
    expect(todayManilaIso(new Date("2026-10-12T16:00:00Z"))).toBe("2026-10-13");
  });
});

describe("milestoneRedateError", () => {
  it("allows an unchanged past date but not a new past one", () => {
    expect(milestoneRedateError("2026-09-01", "2026-09-01", "2026-10-12")).toBeNull();
    expect(milestoneRedateError("2026-09-15", "2026-09-01", "2026-10-12")).toBe(MILESTONE_DATE_PAST_MESSAGE);
    expect(milestoneRedateError("2026-10-12", "2026-09-01", "2026-10-12")).toBeNull();
  });
});
