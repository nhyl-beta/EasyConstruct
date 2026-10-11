/**
 * Philippine statutory payroll deductions.
 *
 * Replaces the flat 12% placeholder that stood in for the SSS, PhilHealth
 * and Pag-IBIG contributions as a single number. Those are three separate
 * computations on three different bases, and a payslip has to show each one,
 * so each is computed and stored separately here and `deductions` becomes
 * their sum.
 *
 * Bases and rates below are the schedules in force for 2025 onward:
 *
 *  - SSS (RA 11199, 2025 schedule): 15% of the monthly salary credit, split
 *    10% employer / 5% employee. The MSC is banded in ₱500 steps between a
 *    ₱5,000 floor and a ₱35,000 ceiling. Only the employee share is withheld
 *    from pay, so only that is deducted here.
 *  - PhilHealth (UHC Act RA 11223, 5% premium): 5% of monthly basic salary
 *    split equally employer/employee (2.5% each), on a ₱10,000–₱100,000
 *    income floor/ceiling.
 *  - Pag-IBIG (HDMF Circular 460): 1% employee share up to ₱1,500 monthly
 *    compensation, 2% above it, on a ₱10,000 maximum fund salary — so the
 *    employee share caps at ₱200.
 *
 * Everything is computed on a MONTHLY basis because that is what every one of
 * these schedules is defined on. A payroll run covering a shorter period is
 * annualized to a monthly equivalent, the monthly deduction is computed, then
 * prorated back — see `computeStatutoryDeductions`.
 *
 * This is a documented, deterministic implementation of the published
 * schedules, not a certified payroll engine: it does not model 13th-month
 * pay, de minimis benefits, substituted filing or the year-end annualization
 * adjustment, and the rates are versioned by hand rather than fetched.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

// ── SSS ──────────────────────────────────────────────────────────────────────
const SSS_MSC_FLOOR = 5_000;
const SSS_MSC_CEILING = 35_000;
const SSS_MSC_STEP = 500;
const SSS_EMPLOYEE_RATE = 0.05;

/**
 * Monthly Salary Credit: the compensation rounded into its ₱500 band, then
 * clamped to the floor/ceiling. SSS brackets run "₱x,750 to ₱y,249.99 → MSC
 * ₱y,000", which is a round-half to the nearest step.
 */
export const sssMonthlySalaryCredit = (monthlyCompensation: number): number => {
  if (monthlyCompensation <= SSS_MSC_FLOOR) return SSS_MSC_FLOOR;
  const banded = Math.round(monthlyCompensation / SSS_MSC_STEP) * SSS_MSC_STEP;
  return Math.min(Math.max(banded, SSS_MSC_FLOOR), SSS_MSC_CEILING);
};

export const sssEmployeeShare = (monthlyCompensation: number): number =>
  round2(sssMonthlySalaryCredit(monthlyCompensation) * SSS_EMPLOYEE_RATE);

// ── PhilHealth ───────────────────────────────────────────────────────────────
const PHILHEALTH_PREMIUM_RATE = 0.05;
const PHILHEALTH_EMPLOYEE_SHARE = 0.5; // split evenly with the employer
const PHILHEALTH_FLOOR = 10_000;
const PHILHEALTH_CEILING = 100_000;

export const philhealthEmployeeShare = (monthlyBasic: number): number => {
  const base = Math.min(Math.max(monthlyBasic, PHILHEALTH_FLOOR), PHILHEALTH_CEILING);
  return round2(base * PHILHEALTH_PREMIUM_RATE * PHILHEALTH_EMPLOYEE_SHARE);
};

// ── Pag-IBIG (HDMF) ──────────────────────────────────────────────────────────
const PAGIBIG_LOW_BRACKET_CEILING = 1_500;
const PAGIBIG_LOW_RATE = 0.01;
const PAGIBIG_HIGH_RATE = 0.02;
const PAGIBIG_MAX_FUND_SALARY = 10_000;

export const pagibigEmployeeShare = (monthlyCompensation: number): number => {
  const base = Math.min(monthlyCompensation, PAGIBIG_MAX_FUND_SALARY);
  const rate =
    monthlyCompensation <= PAGIBIG_LOW_BRACKET_CEILING
      ? PAGIBIG_LOW_RATE
      : PAGIBIG_HIGH_RATE;
  return round2(base * rate);
};

export interface StatutoryDeductions {
  sss: number;
  philhealth: number;
  pagibig: number;
  /** Sum of the three — what lands in payroll.deductions. */
  total: number;
}

/**
 * @param grossForPeriod   gross pay for the payroll period being run
 * @param periodsPerMonth  how many such periods make up a month (1 = monthly,
 *                         2 = semi-monthly, ~4.33 = weekly). Contributions are
 *                         computed on the monthly equivalent and prorated back,
 *                         because every schedule above is defined monthly.
 */
export const computeStatutoryDeductions = (
  grossForPeriod: number,
  periodsPerMonth = 1,
): StatutoryDeductions => {
  if (grossForPeriod <= 0) {
    return { sss: 0, philhealth: 0, pagibig: 0, total: 0 };
  }

  const divisor = periodsPerMonth > 0 ? periodsPerMonth : 1;
  const monthlyEquivalent = grossForPeriod * divisor;

  const sss = sssEmployeeShare(monthlyEquivalent);
  const philhealth = philhealthEmployeeShare(monthlyEquivalent);
  const pagibig = pagibigEmployeeShare(monthlyEquivalent);

  const forPeriod = (monthlyAmount: number) => round2(monthlyAmount / divisor);

  const perPeriod = {
    sss: forPeriod(sss),
    philhealth: forPeriod(philhealth),
    pagibig: forPeriod(pagibig),
  };

  return {
    ...perPeriod,
    total: round2(perPeriod.sss + perPeriod.philhealth + perPeriod.pagibig),
  };
};
