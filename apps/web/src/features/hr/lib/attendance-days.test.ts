import { describe, expect, it } from "vitest";
import type { AttendanceEntry } from "../attendance-api";
import { groupByDay } from "./attendance-days";

const visit = (over: Partial<AttendanceEntry>): AttendanceEntry =>
  ({ id: 1, employeeId: "E1", name: "Juan", initials: "J", site: "S", clockIn: "07:00", clockOut: "11:00", hours: 4, geofence: "Inside", photo: "Verified", status: "Verified", attendanceStatus: "Present", logDate: "2026-11-18", ...over }) as AttendanceEntry;

describe("groupByDay", () => {
  it("one day, two sites: first in, last out, worked hours are summed and the gap is the travel time", () => {
    const [d] = groupByDay([visit({ id: 2, clockIn: "13:00", clockOut: "17:00", status: "Pending" }), visit({ id: 1 })]);
    expect(d!.firstIn).toBe("07:00");
    expect(d!.lastOut).toBe("17:00");
    expect(d!.workedHours).toBe(8);
    expect(d!.gapHours).toBe(2);
    expect(d!.verified).toBe(1);
    expect(d!.visits).toHaveLength(2);
  });

  it("an open visit leaves the last out and gap empty", () => {
    const [d] = groupByDay([visit({ id: 1 }), visit({ id: 2, clockIn: "13:00", clockOut: null, hours: 0 })]);
    expect(d!.open).toBe(true);
    expect(d!.lastOut).toBeNull();
    expect(d!.gapHours).toBeNull();
  });

  it("different people or days stay separate, and an absence is not a clock-in", () => {
    const days = groupByDay([visit({ id: 1 }), visit({ id: 2, employeeId: "E2" }), visit({ id: 3, logDate: "2026-11-17" }), visit({ id: 4, attendanceStatus: "Absent", clockIn: "00:00", clockOut: null, hours: 0 })]);
    expect(days).toHaveLength(3);
    expect(days.find((d) => d.key === "E1|2026-11-18")!.firstIn).toBe("07:00");
  });
});
