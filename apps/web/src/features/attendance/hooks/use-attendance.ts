// apps/web/src/features/attendance/hooks/use-attendance.ts — NEW
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import {
  attendanceRepository,
  type AttendanceRecord,
} from "../repositories/attendance.repository";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

/** The phone's position for the clock-out proof; gives up quietly so a weak signal never traps a worker on site. */
const currentPosition = () =>
  new Promise<{ latitude: number; longitude: number } | undefined>((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

// Employee linkage note: users↔employees are joined by email, not a real FK
// (see Part 1). If an employee record's email doesn't exactly match the
// logged-in user's email, this hook has nothing to key attendance off of.
export function useAttendance(employeeId: string | null) {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await attendanceRepository.listForEmployee(employeeId);
      setRecords(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // One visit per project per day; the open one (no clock-out yet) is the site the worker is at now.
  const visits = records.filter((r) => r.logDate === todayISO());
  const openVisit = visits.find((r) => !r.clockOut);

  const clockIn = useCallback(
    async (opts: { site: string; projectCode?: string; latitude?: number; longitude?: number; photoUrl?: string }) => {
      if (!employeeId) throw new Error("No employee profile linked to this account");
      setSubmitting(true);
      setError(null);
      try {
        await attendanceRepository.clockIn({
          employeeId,
          site: opts.site,
          projectCode: opts.projectCode,
          clockIn: nowHHMM(),
          latitude: opts.latitude,
          longitude: opts.longitude,
          photoUrl: opts.photoUrl,
          logDate: todayISO(),
        });
        await refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to record attendance";
        setError(message);
        throw new Error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [employeeId, refresh],
  );

  const clockOut = useCallback(async () => {
    if (!openVisit) throw new Error("No active attendance record to clock out of");
    setSubmitting(true);
    try {
      await attendanceRepository.clockOut(openVisit.id, nowHHMM(), await currentPosition());
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }, [openVisit, refresh]);

  return { records, visits, openVisit, loading, error, submitting, clockIn, clockOut, refresh, currentUserEmail: user?.email };
}