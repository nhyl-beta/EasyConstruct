// apps/web/src/components/shared/payroll-period-picker.tsx
//
// The payroll period was a blind free-text box: HR had to already know which
// month had attendance logged, and a typo ("2026-9", "Sept 2026") produced a
// batch that matched no attendance rows at all.
//
// Periods are derived from the attendance table itself — the same data
// payroll is generated from — so every suggestion is a month that provably
// has hours behind it, shown with its record count.
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { listAttendance } from "@/features/hr/attendance-api";

export interface PayrollPeriodOption {
  /** "2026-09" — the value written to payroll_batches.period. */
  value: string;
  /** "September 2026 · 84 records" */
  label: string;
  recordCount: number;
}

interface PayrollPeriodPickerProps {
  value: string;
  onChange: (period: string) => void;
  id?: string;
  className?: string;
}

const DATALIST_ID = "payroll-period-suggestions";

function monthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

export function usePayrollPeriods() {
  const [periods, setPeriods] = useState<PayrollPeriodOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listAttendance()
      .then((entries) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const entry of entries) {
          // logDate is an ISO date ("2026-09-19"); the month is the period.
          const period = entry.logDate?.slice(0, 7);
          if (!period || period.length !== 7) continue;
          counts.set(period, (counts.get(period) ?? 0) + 1);
        }
        setPeriods(
          Array.from(counts, ([value, recordCount]) => ({
            value,
            recordCount,
            label: `${monthLabel(value)} · ${recordCount} record${recordCount === 1 ? "" : "s"}`,
          }))
            // Most recent first — that's the period being run in practice.
            .sort((a, b) => b.value.localeCompare(a.value)),
        );
      })
      .catch(() => {
        // A failed lookup only costs the suggestions; the field still accepts
        // a typed period, so payroll generation isn't blocked by it.
        if (!cancelled) setPeriods([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { periods, loading };
}

export function PayrollPeriodPicker({
  value,
  onChange,
  id,
  className,
}: PayrollPeriodPickerProps) {
  const { periods, loading } = usePayrollPeriods();

  const hint = useMemo(() => {
    if (loading) return "Loading periods…";
    if (periods.length === 0) return "No attendance logged yet";
    return `e.g. ${periods[0]?.value}`;
  }, [loading, periods]);

  return (
    <>
      <Input
        id={id}
        list={DATALIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={className}
        autoComplete="off"
      />
      <datalist id={DATALIST_ID}>
        {periods.map((p) => (
          <option key={p.value} value={p.value} label={p.label} />
        ))}
      </datalist>
    </>
  );
}

PayrollPeriodPicker.displayName = "PayrollPeriodPicker";
