import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import * as repo from "./repository.js";
import * as aggregates from "./aggregates.js";
import * as employeesRepo from "../employees/repository.js";
import { getRules } from "../payroll/engine.js";
import type {
  AttendanceInput,
  AttendanceQuery,
  CreateEmployeeInput,
  PayrollQuery,
  UpdateAttendanceInput,
  UpdateEmployeeInput,
} from "./validators.js";

const asNumber = (value: string | number | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value);

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 5);
}

function hoursBetween(clockIn?: string | null, clockOut?: string | null) {
  if (!clockIn || !clockOut) return null;

  const [inHour = 0, inMinute = 0] = clockIn.split(":").map(Number);
  const [outHour = 0, outMinute = 0] = clockOut.split(":").map(Number);

  let minutes =
    outHour * 60 +
    outMinute -
    (inHour * 60 + inMinute);

  if (minutes < 0) {
    minutes += 24 * 60;
  }

  return Math.round((minutes / 60) * 10) / 10;
}

function periodLabel(start: string, end: string) {
  return `${start} to ${end}`;
}

function hourlyRate(employee: { payRate: string; rateType: string }) {
  const rate = asNumber(employee.payRate);

  if (employee.rateType === "Daily") return rate / 8;
  if (employee.rateType === "Monthly") return rate / (22 * 8);

  return rate;
}

export async function listEmployees(filters: {
  search?: string;
  department?: string;
  status?: string;
}) {
  return repo.findEmployees(filters);
}

export async function getEmployee(id: number) {
  const employee = await repo.findEmployee(id);

  if (!employee) {
    throw new NotFoundError("Employee", String(id));
  }

  return employee;
}

export async function createEmployee(input: CreateEmployeeInput) {
  const { performance, payRate, ...employeeData } = input;

  if (await repo.findEmployeeByEmployeeId(input.employeeId)) {
    throw new ConflictError(
      `Employee ID ${input.employeeId} already exists`,
    );
  }

  return repo.insertEmployee({
    ...employeeData,
    initials: initials(input.name),
    email: input.email || null,
    phone: input.phone || null,

    // Database/repository expects payRate as string.
    payRate: String(payRate ?? 0),

    // Database/repository expects performance as string.
    ...(performance !== undefined
      ? { performance: String(performance) }
      : {}),
  });
}

export async function updateEmployee(
  id: number,
  input: UpdateEmployeeInput,
) {
  const existing = await getEmployee(id);
  const {
    performance,
    payRate,
    ...employeeData
  } = input;

  if (
    input.employeeId &&
    input.employeeId !== existing.employeeId
  ) {
    const duplicate = await repo.findEmployeeByEmployeeId(
      input.employeeId,
    );

    if (duplicate) {
      throw new ConflictError(
        `Employee ID ${input.employeeId} already exists`,
      );
    }
  }

  return repo.updateEmployee(id, {
    ...employeeData,

    ...(input.name
      ? { initials: initials(input.name) }
      : {}),

    ...(input.email !== undefined
      ? { email: input.email || null }
      : {}),

    ...(input.phone !== undefined
      ? { phone: input.phone || null }
      : {}),

    ...(payRate !== undefined
      ? { payRate: String(payRate) }
      : {}),

    ...(performance !== undefined
      ? { performance: String(performance) }
      : {}),
  });
}

export async function removeEmployee(id: number) {
  await getEmployee(id);

  const deleted = await repo.deleteEmployee(id);

  if (!deleted) {
    throw new NotFoundError("Employee", String(id));
  }

  return deleted;
}

export async function listAttendance(query: AttendanceQuery) {
  return repo.findAttendance(query);
}

export async function createAttendance(input: AttendanceInput) {
  const employee = await repo.findEmployeeByEmployeeId(
    input.employeeId,
  );

  if (!employee) {
    throw new ValidationError(
      `Employee ${input.employeeId} does not exist`,
    );
  }

  const hours =
    input.hours ??
    hoursBetween(input.clockIn, input.clockOut);

  const flagged =
    input.status === "Flagged" ||
    input.geofence === "Outside" ||
    input.photo === "Failed";

  return repo.insertAttendance({
    ...input,

    // Repository/database expects hours as string or null.
    hours:
      hours === null || hours === undefined
        ? null
        : String(hours),

    geofence: input.geofence ?? "Inside",

    photo: input.photo ?? "Pending",

    status: flagged
      ? "Flagged"
      : input.status ??
        (input.clockOut ? "Verified" : "Pending"),
  });
}

export async function updateAttendance(
  id: number,
  input: UpdateAttendanceInput,
) {
  const existing = await repo.findAttendanceById(id);

  if (!existing) {
    throw new NotFoundError(
      "Attendance record",
      String(id),
    );
  }

  if (
    input.employeeId &&
    !(await repo.findEmployeeByEmployeeId(input.employeeId))
  ) {
    throw new ValidationError(
      `Employee ${input.employeeId} does not exist`,
    );
  }

  const clockIn =
    input.clockIn ?? existing.clockIn;

  const clockOut =
    input.clockOut === undefined
      ? existing.clockOut
      : input.clockOut;

  const hours =
    input.hours === undefined
      ? hoursBetween(clockIn, clockOut) ?? existing.hours
      : input.hours;

  const geofence =
    input.geofence ?? existing.geofence;

  const photo =
    input.photo ?? existing.photo;

  const status =
    input.status ??
    (geofence === "Outside" ||
    photo === "Failed"
      ? "Flagged"
      : clockOut
        ? "Verified"
        : existing.status);

  const normalizedHours =
    hours === null || hours === undefined
      ? undefined
      : typeof hours === "number"
        ? hours.toFixed(1)
        : String(hours);

  /*
   * Remove the original `hours` property from input.
   *
   * UpdateAttendanceInput allows:
   *   string | number | null | undefined
   *
   * But the repository expects:
   *   string | null | undefined
   *
   * We therefore spread everything except hours and
   * insert the normalized value ourselves.
   */
  const {
    hours: _hours,
    ...attendanceInput
  } = input;

  return repo.updateAttendance(id, {
    ...attendanceInput,

    ...(normalizedHours !== undefined
      ? { hours: normalizedHours }
      : {}),

    status,
  });
}

export async function removeAttendance(id: number) {
  const existing = await repo.findAttendanceById(id);

  if (!existing) {
    throw new NotFoundError(
      "Attendance record",
      String(id),
    );
  }

  return repo.deleteAttendance(id);
}

export async function attendanceSummary(date: string) {
  const [totalEmployees, counts] = await Promise.all([
    aggregates.activeEmployeeCount(),
    aggregates.attendanceDayCounts(date),
  ]);
  const { recorded, verified, pending, flagged, late } = counts;

  return {
    date,
    totalEmployees,
    recorded,
    verified,
    pending,
    flagged,
    late,

    absent: Math.max(totalEmployees - recorded, 0),

    onTimeRate: recorded
      ? Math.round(((recorded - late) / recorded) * 1000) / 10
      : 0,
  };
}

async function payrollRowsForPeriod(
  start: string,
  end: string,
) {
  const [activeEmployees, logs] =
    await Promise.all([
      repo.findEmployees({
        status: "Active",
      }),
      repo.findAttendance({
        from: start,
        to: end,
      }),
    ]);

  return activeEmployees.map((employee) => {
    const employeeLogs = logs.filter(
      (log) =>
        log.employeeId === employee.employeeId,
    );

    const totalHours = employeeLogs.reduce(
      (sum, log) =>
        sum +
        asNumber(
          log.hours ??
            hoursBetween(
              log.clockIn,
              log.clockOut,
            ),
        ),
      0,
    );

    const regularHours = Math.min(
      totalHours,
      employeeLogs.length * 8,
    );

    const overtime = Math.max(
      0,
      totalHours - regularHours,
    );

    const rate = hourlyRate(employee);

    const gross =
      regularHours * rate +
      overtime * rate * getRules(end).overtimeMultiplier;

    return {
      empId: employee.employeeId,
      name: employee.name,
      initials: employee.initials,
      role: employee.role,

      hours: Math.round(regularHours),

      overtime: Math.round(overtime),

      gross: gross.toFixed(2),

      net: gross.toFixed(2),

      status: "Pending",

      period: periodLabel(
        start,
        end,
      ),

      periodStart: start,
      periodEnd: end,
    };
  });
}

function summarizePayroll(
  rows: Array<{
    gross: string;
    deductions: string;
    net: string;
    overtime: number;
  }>,
) {
  return rows.reduce(
    (summary, row) => ({
      grossLabor:
        summary.grossLabor +
        asNumber(row.gross),

      deductions:
        summary.deductions +
        asNumber(row.deductions),

      netPayable:
        summary.netPayable +
        asNumber(row.net),

      overtimeHours:
        summary.overtimeHours +
        row.overtime,
    }),

    {
      grossLabor: 0,
      deductions: 0,
      netPayable: 0,
      overtimeHours: 0,
    },
  );
}

export async function getPayroll(
  query: PayrollQuery,
) {
  const rows = await repo.findPayroll(
    query.period,
  );

  return {
    rows,
    totals: summarizePayroll(rows),
  };
}

export async function getTracksheet(
  query: PayrollQuery,
) {
  if (
    !query.periodStart ||
    !query.periodEnd
  ) {
    throw new ValidationError(
      "periodStart and periodEnd are required",
    );
  }

  const logs =
    await repo.findAttendance({
      from: query.periodStart,
      to: query.periodEnd,
    });

  const employeeIds = [
    ...new Set(
      logs.map(
        (log) => log.employeeId,
      ),
    ),
  ];

  const employeesById = await employeesRepo.findByEmployeeIds(employeeIds);

  return logs.map((log) => ({
    ...log,

    employee:
      employeesById.get(
        log.employeeId,
      )?.name ??
      log.employeeId,

    regularHours: Math.min(
      asNumber(log.hours),
      8,
    ),

    overtimeHours: Math.max(
      0,
      asNumber(log.hours) - 8,
    ),
  }));
}

export async function getGrossLabor(
  query: PayrollQuery,
) {
  const rows =
    await repo.findPayroll(
      query.period,
    );

  return {
    period:
      query.period ?? "all",

    ...summarizePayroll(rows),

    employeeCount:
      rows.length,
  };
}

export async function getGrossTracking(
  query: PayrollQuery,
) {
  const start = query.periodStart;
  const end = query.periodEnd;

  if (!start || !end) {
    throw new ValidationError(
      "periodStart and periodEnd are required",
    );
  }

  const rows =
    await payrollRowsForPeriod(
      start,
      end,
    );

  return rows.map((row) => ({
    employeeId: row.empId,
    employee: row.name,
    period: row.period,
    hours: row.hours,
    overtime: row.overtime,
    grossLabor: row.gross,
  }));
}

export async function workforceReport(
  from?: string,
  to?: string,
) {
  const agg = await aggregates.workforceAggregates(from, to);
  const activeCount = agg.totals.active;

  return {
    range: {
      from: from ?? null,
      to: to ?? null,
    },

    totals: {
      headcount: agg.totals.headcount,
      active: activeCount,
      onLeave: agg.totals.onLeave,
      suspended: agg.totals.suspended,
      attendanceRecords: agg.attendanceRecords,
    },

    byDepartment: agg.departments.map((d) => ({
      department: d.department,
      headcount: d.headcount,
      active: d.active,
    })),

    bySite: agg.sites.map((s) => ({
      site: s.site,
      headcount: s.headcount,
      present: s.present,
    })),

    dailyAttendance: agg.days.map((day) => ({
      date: day.date,
      present: day.present,
      late: day.late,
      absent: Math.max(activeCount - day.recorded, 0),
    })),
  };
}
