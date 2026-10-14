import { describe, expect, it } from "vitest";

import { classifySyncFailure, failureMessage } from "./sync-classify";

const apiError = (status: number, code?: string) => Object.assign(new Error(`API error ${status}`), { status, body: code ? { code } : null });

describe("classifySyncFailure", () => {
  it("a network failure (no status) is retried", () => {
    expect(classifySyncFailure(new TypeError("Failed to fetch"))).toBe("retry");
    expect(classifySyncFailure(undefined)).toBe("retry");
  });
  it("5xx, 408 and 429 are retried", () => {
    for (const s of [500, 502, 503, 504, 408, 429]) expect(classifySyncFailure(apiError(s)), String(s)).toBe("retry");
  });
  it("a duplicate for that day is dropped", () => {
    expect(classifySyncFailure(apiError(409, "ATTENDANCE_DUPLICATE"))).toBe("duplicate");
  });
  it("any other 4xx needs attention, including a 409 that is not the duplicate", () => {
    for (const s of [400, 403, 404, 422]) expect(classifySyncFailure(apiError(s)), String(s)).toBe("needs-attention");
    expect(classifySyncFailure(apiError(409, "CONFLICT"))).toBe("needs-attention");
    expect(classifySyncFailure(apiError(409))).toBe("needs-attention");
  });
  it("failureMessage uses the server message", () => {
    expect(failureMessage(new Error("Attendance can only be logged while the project is in Construction"))).toMatch(/Construction/);
    expect(failureMessage("x")).toBe("Sync failed");
  });
});
