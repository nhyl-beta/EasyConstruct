// Counts for the HR attendance summary and workforce report, computed in SQL
// (COUNT / FILTER / GROUP BY) instead of fetching every employee and every
// attendance row and counting in JavaScript. The shapes the service returns
// are unchanged; hr/aggregates.db-test.ts compares this against the previous
// JavaScript implementation on the same rows.
import { and, eq, gte, lte, sql, SQL } from "drizzle-orm";
import { db } from "../db/connection.js";
import { attendance, employees } from "../db/schema/index.js";

// clock_in is a varchar "HH:MM"; the old code compared it as a JS string
// ("> '08:00'"), i.e. byte order. COLLATE "C" gives the same ordering in SQL
// regardless of the database's locale.
const isLate = sql`${attendance.clockIn} COLLATE "C" > '08:00'`;

export async function activeEmployeeCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.status, "Active"));
  return row?.n ?? 0;
}

export async function attendanceDayCounts(date: string) {
  const [row] = await db
    .select({
      recorded: sql<number>`count(*)::int`,
      verified: sql<number>`(count(*) filter (where ${attendance.status} = 'Verified'))::int`,
      pending: sql<number>`(count(*) filter (where ${attendance.status} = 'Pending'))::int`,
      flagged: sql<number>`(count(*) filter (where ${attendance.status} = 'Flagged' or ${attendance.geofence} = 'Outside' or ${attendance.photo} = 'Failed'))::int`,
      late: sql<number>`(count(*) filter (where ${isLate}))::int`,
    })
    .from(attendance)
    .where(eq(attendance.logDate, date));
  return row ?? { recorded: 0, verified: 0, pending: 0, flagged: 0, late: 0 };
}

const rangeConditions = (from?: string, to?: string): SQL[] => {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(attendance.logDate, from));
  if (to) conditions.push(lte(attendance.logDate, to));
  return conditions;
};

export async function workforceAggregates(from?: string, to?: string) {
  const conditions = rangeConditions(from, to);
  const inRange = conditions.length ? and(...conditions) : undefined;

  const [totalsRow, departments, sites, presentBySite, days] = await Promise.all([
    db
      .select({
        headcount: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${employees.status} = 'Active'))::int`,
        onLeave: sql<number>`(count(*) filter (where ${employees.status} = 'On Leave'))::int`,
        suspended: sql<number>`(count(*) filter (where ${employees.status} = 'Suspended'))::int`,
      })
      .from(employees),
    // Groups appear in the order of their alphabetically-first employee, which
    // is the order the old name-sorted JS loop first met each department.
    db
      .select({
        department: employees.department,
        headcount: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${employees.status} = 'Active'))::int`,
      })
      .from(employees)
      .groupBy(employees.department)
      .orderBy(sql`min(${employees.name})`),
    db
      .select({
        site: employees.site,
        headcount: sql<number>`count(*)::int`,
      })
      .from(employees)
      .groupBy(employees.site)
      .orderBy(sql`min(${employees.name})`),
    db
      .select({
        site: employees.site,
        present: sql<number>`count(*)::int`,
      })
      .from(attendance)
      .innerJoin(employees, eq(employees.employeeId, attendance.employeeId))
      .where(and(eq(attendance.status, "Verified"), inRange))
      .groupBy(employees.site),
    db
      .select({
        date: attendance.logDate,
        present: sql<number>`(count(*) filter (where ${attendance.status} = 'Verified'))::int`,
        late: sql<number>`(count(*) filter (where ${isLate}))::int`,
        recorded: sql<number>`count(distinct ${attendance.employeeId})::int`,
        records: sql<number>`count(*)::int`,
      })
      .from(attendance)
      .where(inRange)
      .groupBy(attendance.logDate)
      .orderBy(attendance.logDate),
  ]);

  const totals = totalsRow[0] ?? { headcount: 0, active: 0, onLeave: 0, suspended: 0 };
  const presentLookup = new Map(presentBySite.map((r) => [r.site, r.present]));
  return {
    totals,
    departments,
    sites: sites.map((s) => ({ site: s.site, headcount: s.headcount, present: presentLookup.get(s.site) ?? 0 })),
    days,
    attendanceRecords: days.reduce((sum, d) => sum + d.records, 0),
  };
}

/**
 * The HR "Workforce reporting" board: headcount by status, headcount and
 * present-days per department and site, and a daily Present / Late / Absent
 * tally, all counted in SQL. The definitions are those the page used when it
 * counted full lists in the browser: "present" is attendance_status = 'Present'
 * (per attendance site), not verification status.
 */
export async function workforceBoard(from?: string, to?: string) {
  const inRange = and(...rangeConditions(from, to));

  const [totalsRow, departments, sites, presentBySite, daily] = await Promise.all([
    db
      .select({
        headcount: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${employees.status} = 'Active'))::int`,
        onLeave: sql<number>`(count(*) filter (where ${employees.status} = 'On Leave'))::int`,
        suspended: sql<number>`(count(*) filter (where ${employees.status} = 'Suspended'))::int`,
      })
      .from(employees),
    db
      .select({
        department: employees.department,
        headcount: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${employees.status} = 'Active'))::int`,
      })
      .from(employees)
      .groupBy(employees.department),
    db
      .select({ site: employees.site, headcount: sql<number>`count(*)::int` })
      .from(employees)
      .groupBy(employees.site),
    db
      .select({ site: attendance.site, present: sql<number>`count(*)::int` })
      .from(attendance)
      .where(and(eq(attendance.attendanceStatus, "Present"), inRange))
      .groupBy(attendance.site),
    db
      .select({
        date: attendance.logDate,
        present: sql<number>`(count(*) filter (where ${attendance.attendanceStatus} = 'Present'))::int`,
        late: sql<number>`(count(*) filter (where ${attendance.attendanceStatus} = 'Late'))::int`,
        absent: sql<number>`(count(*) filter (where ${attendance.attendanceStatus} = 'Absent'))::int`,
        records: sql<number>`count(*)::int`,
      })
      .from(attendance)
      .where(inRange)
      .groupBy(attendance.logDate),
  ]);

  const presentLookup = new Map(presentBySite.map((r) => [r.site, r.present]));
  const totals = totalsRow[0] ?? { headcount: 0, active: 0, onLeave: 0, suspended: 0 };
  return {
    totals: { ...totals, attendanceRecords: daily.reduce((sum, d) => sum + d.records, 0) },
    byDepartment: departments.sort((a, b) => a.department.localeCompare(b.department)),
    bySite: sites
      .map((s) => ({ site: s.site, headcount: s.headcount, present: presentLookup.get(s.site) ?? 0 }))
      .sort((a, b) => a.site.localeCompare(b.site)),
    dailyAttendance: daily
      .map(({ records: _records, ...d }) => d)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
