import { useEffect, useState } from "react";
import { meRepository, type MyAttendanceRow, type MyEmployee, type MyPayslip } from "../repositories/me.repository";

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("en-CA");

/** The person's own employee link, recent attendance (90 days) and approved payslips. */
export function useMyRecord() {
  const [link, setLink] = useState<MyEmployee | null>(null);
  const [attendance, setAttendance] = useState<MyAttendanceRow[]>([]);
  const [payslips, setPayslips] = useState<MyPayslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await meRepository.employee();
        if (cancelled) return;
        setLink(me);
        if (me.linked) {
          const [a, p] = await Promise.all([meRepository.attendance(daysAgoIso(90)), meRepository.payslips()]);
          if (cancelled) return;
          setAttendance(a);
          setPayslips(p);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { link, attendance, payslips, loading, error };
}
