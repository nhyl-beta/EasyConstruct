/**
 * Payroll computation engine — the single place a payroll line's money is
 * computed. Used by generate, line edit and validation; the client only ever
 * displays what this returns.
 *
 * Rates come from `getRules(periodEnd)`. Today that returns the built-in
 * 2025 schedules; when dated rate versions live in a repository, only that
 * function changes (the `versions` map already carries the IDs that get
 * stored on every line).
 *
 * Not a certified payroll engine: no 13th-month, de minimis, substituted
 * filing or year-end annualization. The system produces liabilities and
 * reports — it does not remit anything to SSS, PhilHealth or Pag-IBIG.
 * Employee deductions are the three contributions only.
 */

export interface PayrollRules {
  /** Rate-version IDs per agency, stored on every computed line. */
  versions: { sss: string; philhealth: string; pagibig: string; overtime: string };
  /** Rule values that have not been verified against the agency circular. */
  needsVerification: string[];
  hoursPerDay: number;
  workingDaysPerMonth: number;
  overtimeMultiplier: number;
  sss: {
    mscFloor: number;
    mscCeiling: number;
    mscStep: number;
    /** Compensation strictly below which the minimum MSC applies (5,250 itself bands to 5,500). */
    lowCompensationCeiling: number;
    employeeRate: number;
    employerRate: number;
    ecLow: number;
    ecHigh: number;
    ecThreshold: number;
  };
  philhealth: { premiumRate: number; floor: number; ceiling: number };
  pagibig: {
    lowBracketCeiling: number;
    lowRate: number;
    highRate: number;
    employerRate: number;
    maxFundSalary: number;
  };
}

const DEFAULT_OVERTIME_MULTIPLIER = 1.5;

const overtimeMultiplierSetting = (): number => {
  const raw = Number(process.env.PAYROLL_OVERTIME_MULTIPLIER);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_OVERTIME_MULTIPLIER;
};

/** Rules in force for a period ending on `_periodEnd` (YYYY-MM-DD). */
export const getRules = (_periodEnd?: string): PayrollRules => ({
  versions: {
    sss: "builtin-sss-2025",
    philhealth: "builtin-philhealth-2025",
    pagibig: "builtin-pagibig-2025",
    overtime: "builtin-overtime-1.5",
  },
  needsVerification: ["SSS EC (₱10 below MSC 15,000, otherwise ₱30)"],
  hoursPerDay: 8,
  workingDaysPerMonth: 22,
  overtimeMultiplier: overtimeMultiplierSetting(),
  sss: {
    mscFloor: 5_000,
    mscCeiling: 35_000,
    mscStep: 500,
    lowCompensationCeiling: 5_250,
    employeeRate: 0.05,
    employerRate: 0.1,
    ecLow: 10,
    ecHigh: 30,
    ecThreshold: 15_000,
  },
  philhealth: { premiumRate: 0.05, floor: 10_000, ceiling: 100_000 },
  pagibig: {
    lowBracketCeiling: 1_500,
    lowRate: 0.01,
    highRate: 0.02,
    employerRate: 0.02,
    maxFundSalary: 10_000,
  },
});

/** One rounding rule for every amount. */
export const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const toHourlyRate = (payRate: number, rateType: string, rules: PayrollRules): number => {
  switch (rateType) {
    case "Hourly":
      return payRate;
    case "Daily":
      return payRate / rules.hoursPerDay;
    case "Monthly":
    default:
      return payRate / (rules.workingDaysPerMonth * rules.hoursPerDay);
  }
};

export const sssMsc = (compensation: number, rules: PayrollRules): number => {
  const r = rules.sss;
  if (compensation < r.lowCompensationCeiling) return r.mscFloor;
  const banded = Math.round(compensation / r.mscStep) * r.mscStep;
  return Math.min(Math.max(banded, r.mscFloor), r.mscCeiling);
};

export interface LineInput {
  payRate: number;
  rateType: string;
  regularHours: number;
  overtimeHours: number;
  adjustments: number;
}

export interface ComputedLine {
  hourlyRate: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  /** Sum of the three employee contributions (SSS + PhilHealth + Pag-IBIG). */
  deductions: number;
  net: number;
  employerSss: number;
  employerEc: number;
  employerPhilhealth: number;
  employerPagibig: number;
  employerContributions: number;
  /** gross + employer contributions */
  employerCost: number;
  versions: PayrollRules["versions"];
}

export const computeLine = (input: LineInput, rules: PayrollRules): ComputedLine => {
  const hourlyRate = toHourlyRate(input.payRate, input.rateType, rules);
  const gross = round2(
    input.regularHours * hourlyRate +
      input.overtimeHours * hourlyRate * rules.overtimeMultiplier +
      input.adjustments,
  );

  if (gross <= 0) {
    return {
      hourlyRate,
      gross: 0,
      sss: 0,
      philhealth: 0,
      pagibig: 0,
      deductions: 0,
      net: 0,
      employerSss: 0,
      employerEc: 0,
      employerPhilhealth: 0,
      employerPagibig: 0,
      employerContributions: 0,
      employerCost: 0,
      versions: rules.versions,
    };
  }

  const msc = sssMsc(gross, rules);
  const sss = round2(msc * rules.sss.employeeRate);
  const employerSss = round2(msc * rules.sss.employerRate);
  const employerEc = msc < rules.sss.ecThreshold ? rules.sss.ecLow : rules.sss.ecHigh;

  const phBase = Math.min(Math.max(gross, rules.philhealth.floor), rules.philhealth.ceiling);
  const phTotal = phBase * rules.philhealth.premiumRate;
  const philhealth = round2(phTotal / 2);
  const employerPhilhealth = round2(phTotal / 2);

  const pi = rules.pagibig;
  const piBase = Math.min(gross, pi.maxFundSalary);
  const pagibig = round2(piBase * (gross <= pi.lowBracketCeiling ? pi.lowRate : pi.highRate));
  const employerPagibig = round2(piBase * pi.employerRate);

  const deductions = round2(sss + philhealth + pagibig);
  const employerContributions = round2(
    employerSss + employerEc + employerPhilhealth + employerPagibig,
  );

  return {
    hourlyRate,
    gross,
    sss,
    philhealth,
    pagibig,
    deductions,
    net: round2(gross - deductions),
    employerSss,
    employerEc,
    employerPhilhealth,
    employerPagibig,
    employerContributions,
    employerCost: round2(gross + employerContributions),
    versions: rules.versions,
  };
};

/**
 * End date (YYYY-MM-DD) of a payroll period label so `getRules` can pick the
 * rate version in force. Understands "YYYY-MM" (the period picker's format)
 * and labels containing an ISO date range; anything else falls back to today.
 */
export const periodEndDate = (period: string): string => {
  const month = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (month) {
    const year = Number(month[1]);
    const m = Number(month[2]);
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return `${month[1]}-${month[2]}-${String(last).padStart(2, "0")}`;
  }
  const dates = period.match(/\d{4}-\d{2}-\d{2}/g);
  if (dates?.length) return dates[dates.length - 1]!;
  return new Date().toISOString().slice(0, 10);
};
