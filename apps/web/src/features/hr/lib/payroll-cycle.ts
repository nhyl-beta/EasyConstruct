export type PayCycle = "monthly" | "first-half" | "second-half";

export const PAY_CYCLES: { value: PayCycle; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "first-half", label: "Semi-monthly: 1st to 15th" },
  { value: "second-half", label: "Semi-monthly: 16th to end of month" },
];

/**
 * The batch's period label and the attendance dates it covers. Monthly keeps the
 * "YYYY-MM" label; a semi-monthly half is "YYYY-MM-DD to YYYY-MM-DD", which the
 * payroll API already reads as a date range.
 */
export function payrollPeriod(month: string, cycle: PayCycle): { label: string; from?: string; to?: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return { label: month.trim() };
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  const day = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const from = day(cycle === "second-half" ? 16 : 1);
  const to = day(cycle === "first-half" ? 15 : last);
  return { label: cycle === "monthly" ? month : `${from} to ${to}`, from, to };
}
