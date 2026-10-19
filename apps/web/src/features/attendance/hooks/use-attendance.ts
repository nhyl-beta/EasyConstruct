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

  const today = records.find((r) => r.logDate === todayISO());

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
    if (!today) throw new Error("No active attendance record to clock out of");
    setSubmitting(true);
    try {
      await attendanceRepository.clockOut(today.id, nowHHMM());
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }, [today, refresh]);

  return { records, today, loading, error, submitting, clockIn, clockOut, refresh, currentUserEmail: user?.email };
}