// apps/api/src/payroll/trace.ts: pure, no I/O (objectives fix 2.5)
//
// Explains how one stored payroll line was worked out: the attendance behind its
// hours, the step-by-step figures, and the rate versions the engine used. It
// recomputes the line from the current inputs with the same engine and says
// whether the result matches what is stored, so a difference (for example a pay
// rate changed after the batch was built) is visible rather than hidden.
import { computeLine, round2, toHourlyRate, type PayrollRules } from "./engine.js";

export interface TraceLine {
  hours: number;
  overtime: number;
  adjustments: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  deductions: number;
  net: number;
  employerSss: number;
  employerEc: number;
  employerPhilhealth: number;
  employerPagibig: number;
  employerCost: number;
  rateVersions: Record<string, string> | null;
}

export interface TraceAttendance {
  id: number;
  logDate: string;
  clockIn: string;
  clockOut: string | null;
  hours: number;
  attendanceStatus: string;
  /** Verification status: Verified | Pending | Flagged. */
  verification: string;
}

export interface TraceStep {
  label: string;
  formula: string;
  amount: number | null;
}

export interface PayrollTrace {
  steps: TraceStep[];
  rateVersions: Record<string, string> | null;
  attendance: (TraceAttendance & { counted: boolean; regular: number; overtime: number })[];
  attendanceTotals: { regular: number; overtime: number; unverifiedRecords: number };
  /** Hours on the line against the hours verified attendance supports. */
  hoursNote: string;
  recomputed: { matches: boolean; differences: string[] };
}

const php = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Splits one day's hours into regular and overtime at the standard shift, the
 * same rule the attendance prefill uses (payroll/service.ts getAttendanceSummary).
 */
export const splitDay = (hours: number, hoursPerDay: number): { regular: number; overtime: number } => ({
  regular: Math.min(hours, hoursPerDay),
  overtime: Math.max(hours - hoursPerDay, 0),
});

const FIELDS: { key: keyof TraceLine; label: string }[] = [
  { key: "gross", label: "gross pay" },
  { key: "sss", label: "SSS" },
  { key: "philhealth", label: "PhilHealth" },
  { key: "pagibig", label: "Pag-IBIG" },
  { key: "net", label: "net pay" },
  { key: "employerCost", label: "employer cost" },
];

export const buildTrace = (input: {
  line: TraceLine;
  employee: { payRate: number; rateType: string };
  attendance: TraceAttendance[];
  rules: PayrollRules;
}): PayrollTrace => {
  const { line, employee, rules } = input;
  const hourly = toHourlyRate(employee.payRate, employee.rateType, rules);
  const regularPay = round2(line.hours * hourly);
  const overtimePay = round2(line.overtime * hourly * rules.overtimeMultiplier);
  const sssMscNote = line.sss > 0 ? round2(line.sss / rules.sss.employeeRate) : 0;

  const steps: TraceStep[] = [
    {
      label: "Hourly rate",
      formula:
        employee.rateType === "Hourly"
          ? `${php(employee.payRate)} per hour`
          : employee.rateType === "Daily"
            ? `${php(employee.payRate)} per day ÷ ${rules.hoursPerDay} hours`
            : `${php(employee.payRate)} per month ÷ (${rules.workingDaysPerMonth} days × ${rules.hoursPerDay} hours)`,
      amount: round2(hourly),
    },
    { label: "Regular pay", formula: `${line.hours} hours × ${php(hourly)}`, amount: regularPay },
    {
      label: "Overtime pay",
      formula: `${line.overtime} hours × ${php(hourly)} × ${rules.overtimeMultiplier}`,
      amount: overtimePay,
    },
    { label: "Adjustments", formula: "Added by HR before deductions", amount: line.adjustments },
    { label: "Gross pay", formula: "Regular + overtime + adjustments", amount: line.gross },
    {
      label: "SSS (employee)",
      formula: `Monthly salary credit × ${rules.sss.employeeRate * 100}%${sssMscNote ? ` (credit about ${php(sssMscNote)})` : ""}`,
      amount: line.sss,
    },
    {
      label: "PhilHealth (employee)",
      formula: `Gross between ${php(rules.philhealth.floor)} and ${php(rules.philhealth.ceiling)} × ${rules.philhealth.premiumRate * 100}%, split in half`,
      amount: line.philhealth,
    },
    {
      label: "Pag-IBIG (employee)",
      formula: `Gross up to ${php(rules.pagibig.maxFundSalary)} × ${rules.pagibig.lowRate * 100}% (gross ≤ ${php(rules.pagibig.lowBracketCeiling)}) or ${rules.pagibig.highRate * 100}%`,
      amount: line.pagibig,
    },
    { label: "Net pay", formula: "Gross pay − employee deductions", amount: line.net },
    { label: "Employer SSS", formula: `Salary credit × ${rules.sss.employerRate * 100}%`, amount: line.employerSss },
    { label: "Employer EC", formula: "Employees' compensation, fixed by salary credit", amount: line.employerEc },
    { label: "Employer PhilHealth", formula: "The other half of the premium", amount: line.employerPhilhealth },
    { label: "Employer Pag-IBIG", formula: `Gross up to ${php(rules.pagibig.maxFundSalary)} × ${rules.pagibig.employerRate * 100}%`, amount: line.employerPagibig },
    { label: "Employer cost", formula: "Gross pay + employer contributions", amount: line.employerCost },
  ];

  // Which attendance rows the hours rest on: verified records with hours.
  const rows = input.attendance
    .map((a) => {
      const counted = a.verification === "Verified" && a.hours > 0;
      const { regular, overtime } = counted ? splitDay(a.hours, rules.hoursPerDay) : { regular: 0, overtime: 0 };
      return { ...a, counted, regular, overtime };
    })
    .sort((a, b) => a.logDate.localeCompare(b.logDate));
  const regular = round2(rows.reduce((s, r) => s + r.regular, 0));
  const overtime = round2(rows.reduce((s, r) => s + r.overtime, 0));
  const unverifiedRecords = rows.filter((r) => r.verification !== "Verified").length;

  const hoursNote =
    rows.length === 0
      ? "No attendance records found for this person, project and period. The hours on the line were entered by HR."
      : round2(line.hours) === regular && round2(line.overtime) === overtime
        ? "The hours on the line match the verified attendance."
        : `The line has ${line.hours} regular and ${line.overtime} overtime hours; verified attendance supports ${regular} and ${overtime}. HR may have adjusted them.`;

  // Recompute with the current pay rate and the period's rules, and compare.
  const again = computeLine(
    {
      payRate: employee.payRate,
      rateType: employee.rateType,
      regularHours: line.hours,
      overtimeHours: line.overtime,
      adjustments: line.adjustments,
    },
    rules,
  );
  const differences: string[] = [];
  for (const f of FIELDS) {
    const stored = Number(line[f.key]);
    const fresh = f.key === "employerCost" ? again.employerCost : (again as unknown as Record<string, number>)[f.key as string]!;
    if (Math.abs(stored - fresh) > 0.01) {
      differences.push(`${f.label}: stored ${php(stored)}, recomputed ${php(fresh)}`);
    }
  }

  return {
    steps,
    rateVersions: line.rateVersions,
    attendance: rows,
    attendanceTotals: { regular, overtime, unverifiedRecords },
    hoursNote,
    recomputed: { matches: differences.length === 0, differences },
  };
};
