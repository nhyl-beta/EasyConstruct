// apps/api/src/attendance/import.ts
//
// Site attendance by spreadsheet: Site Personnel uploads an Excel sheet of the
// workers who were on site, it is parsed and validated row by row, and only
// rows that pass are stored as attendance records.
//
// Two steps, both taking the FILE (never client-supplied parsed rows, which
// could be edited after the preview): `previewSheet` parses and validates and
// writes nothing; `commitSheet` runs the exact same validation again and then
// inserts the valid rows. Imported rows land as Pending — no photo or
// geofence backs them — so HR verifies them like any other unverified entry,
// and verified hours reach payroll through the existing verified-attendance
// summary (payroll/service.ts getAttendanceSummary). Nothing here bypasses
// that review.
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { assertProjectWritable } from "../../projects/index.js";
import * as employeesRepo from "../employees/repository.js";
import { projectMemberRepo } from "../../projects/index.js";
import { notificationsService } from "../../platform/index.js";
import { logAudit } from "../../../core/audit/audit.js";
import * as repo from "./repository.js";

export const MAX_SHEET_ROWS = 500;
/** How far back a sheet may reach. Older entries are payroll corrections, not site logs. */
export const MAX_BACKDATE_DAYS = 90;
const MAX_SHIFT_HOURS = 16;

export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "On Leave", "Half Day"] as const;
/** Statuses that legitimately have no clock times. */
const NO_TIMES_STATUSES = new Set(["Absent", "On Leave"]);

// Header text accepted for each column (compared lower-cased, trimmed).
const HEADER_ALIASES: Record<string, string[]> = {
  workerId: ["worker id", "employee id", "worker_id", "employeeid", "id"],
  date: ["date", "log date", "attendance date"],
  timeIn: ["time in", "clock in", "in", "time_in"],
  timeOut: ["time out", "clock out", "out", "time_out"],
  status: ["status", "attendance status"],
  remarks: ["remarks", "notes", "note"],
};
const REQUIRED_COLUMNS = ["workerId", "date"] as const;

export interface SheetRow {
  /** Row number in the sheet (1-based, header = 1) so errors can be located. */
  row: number;
  workerId: string;
  workerName: string | null;
  date: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hours: string | null;
  status: string;
  remarks: string | null;
  errors: string[];
}

export interface SheetReport {
  projectCode: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: SheetRow[];
}

const todayInManila = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const pad = (n: number) => String(n).padStart(2, "0");

// ── Cell parsing ─────────────────────────────────────────────────────────

const cellText = (value: ExcelJS.CellValue): string => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
};

const isoFromParts = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** Accepts real date cells, Excel serial numbers, yyyy-mm-dd and m/d/yyyy text. */
export const parseDateCell = (value: ExcelJS.CellValue): string | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    // Excel date cells have no time zone; exceljs hands them back as UTC.
    return isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    // Excel serial date (1900 system): days since 1899-12-30.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = cellText(value);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return isoFromParts(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
};

/** Accepts real time cells, day fractions, "HH:MM" and "h:mm AM/PM" text. Returns "HH:MM". */
export const parseTimeCell = (value: ExcelJS.CellValue): string | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return null;
    const minutes = Math.round(value * 24 * 60);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  const text = cellText(value);
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
};

const hoursBetween = (timeIn: string, timeOut: string): number => {
  const [ih = 0, im = 0] = timeIn.split(":").map(Number);
  const [oh = 0, om = 0] = timeOut.split(":").map(Number);
  return (oh * 60 + om - (ih * 60 + im)) / 60;
};

// ── Sheet reading ────────────────────────────────────────────────────────

interface RawRow {
  row: number;
  cells: Record<string, ExcelJS.CellValue>;
}

const readWorkbook = async (buffer: Buffer): Promise<RawRow[]> => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError("That file could not be read. Upload an Excel workbook (.xlsx), or start from the template.");
  }

  // The data sheet is the one named "Attendance" if present, else the first.
  const sheet = workbook.getWorksheet("Attendance") ?? workbook.worksheets[0];
  if (!sheet) throw new ValidationError("The workbook has no sheets.");

  const headerRow = sheet.getRow(1);
  const columnByField = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const header = cellText(cell.value).toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(header) && !columnByField.has(field)) columnByField.set(field, colNumber);
    }
  });

  const missing = REQUIRED_COLUMNS.filter((field) => !columnByField.has(field));
  if (missing.length > 0 || !columnByField.has("timeIn")) {
    const need = [
      !columnByField.has("workerId") && "Worker ID",
      !columnByField.has("date") && "Date",
      !columnByField.has("timeIn") && "Time In",
    ].filter(Boolean);
    throw new ValidationError(
      `Missing column${need.length === 1 ? "" : "s"}: ${need.join(", ")}. The first row must contain the headers Worker ID, Date, Time In, Time Out, Status, Remarks — use the template.`,
    );
  }

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, ExcelJS.CellValue> = {};
    let any = false;
    for (const [field, col] of columnByField) {
      const value = row.getCell(col).value;
      cells[field] = value;
      if (cellText(value) !== "") any = true;
    }
    if (any) rows.push({ row: rowNumber, cells });
  });

  if (rows.length === 0) throw new ValidationError("The sheet has no attendance rows under the header.");
  if (rows.length > MAX_SHEET_ROWS) {
    throw new ValidationError(`The sheet has ${rows.length} rows; the limit is ${MAX_SHEET_ROWS} per upload. Split it into smaller sheets.`);
  }
  return rows;
};

// ── Validation ───────────────────────────────────────────────────────────

const validateRows = async (raw: RawRow[]): Promise<SheetRow[]> => {
  const today = todayInManila();
  const earliest = new Date(`${today}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - MAX_BACKDATE_DAYS);
  const earliestIso = earliest.toISOString().slice(0, 10);

  const seen = new Set<string>();
  const employeeCache = new Map<string, Awaited<ReturnType<typeof employeesRepo.findByEmployeeId>>>();
  const out: SheetRow[] = [];

  for (const { row, cells } of raw) {
    const errors: string[] = [];
    const workerId = cellText(cells.workerId).toUpperCase();
    const statusText = cellText(cells.status);
    const status =
      ATTENDANCE_STATUSES.find((s) => s.toLowerCase() === statusText.toLowerCase()) ?? (statusText ? null : "Present");
    if (status === null) errors.push(`Status "${statusText}" isn't one of ${ATTENDANCE_STATUSES.join(", ")}`);

    // Worker
    let workerName: string | null = null;
    if (!workerId) {
      errors.push("Worker ID is missing");
    } else {
      if (!employeeCache.has(workerId)) employeeCache.set(workerId, await employeesRepo.findByEmployeeId(workerId));
      const employee = employeeCache.get(workerId);
      if (!employee) errors.push(`No worker with ID ${workerId}`);
      else workerName = employee.name;
    }

    // Date
    const date = parseDateCell(cells.date);
    if (!date) errors.push(cellText(cells.date) ? `Date "${cellText(cells.date)}" isn't valid (use YYYY-MM-DD)` : "Date is missing");
    else if (date > today) errors.push(`Date ${date} is in the future`);
    else if (date < earliestIso) errors.push(`Date ${date} is more than ${MAX_BACKDATE_DAYS} days ago`);

    // Times
    const timeInText = cellText(cells.timeIn);
    const timeOutText = cellText(cells.timeOut);
    const timeIn = parseTimeCell(cells.timeIn);
    const timeOut = parseTimeCell(cells.timeOut);
    const needsTimes = !NO_TIMES_STATUSES.has(status ?? "Present");
    if (needsTimes && !timeInText) errors.push("Time In is missing");
    else if (timeInText && !timeIn) errors.push(`Time In "${timeInText}" isn't valid (use HH:MM)`);
    if (timeOutText && !timeOut) errors.push(`Time Out "${timeOutText}" isn't valid (use HH:MM)`);
    let hours: string | null = null;
    if (timeIn && timeOut) {
      const h = hoursBetween(timeIn, timeOut);
      if (h <= 0) errors.push("Time Out must be after Time In");
      else if (h > MAX_SHIFT_HOURS) errors.push(`${h.toFixed(1)} hours in one day is more than the ${MAX_SHIFT_HOURS}-hour limit`);
      else hours = h.toFixed(1);
    }

    // Duplicates: within the sheet, and against what is already on record.
    if (workerId && date) {
      const key = `${workerId}|${date}`;
      if (seen.has(key)) errors.push(`${workerId} appears more than once for ${date}`);
      seen.add(key);
      if (errors.length === 0 || !errors.some((e) => e.startsWith("No worker"))) {
        const existing = await repo.findAll({ employeeId: workerId, dateFrom: date, dateTo: date });
        if (existing.length > 0) errors.push(`Attendance for ${workerId} on ${date} is already recorded`);
      }
    }

    out.push({
      row,
      workerId,
      workerName,
      date,
      timeIn: timeIn ?? null,
      timeOut: timeOut ?? null,
      hours,
      status: status ?? statusText,
      remarks: cellText(cells.remarks) || null,
      errors,
    });
  }
  return out;
};

// ── Project / actor checks ───────────────────────────────────────────────

const loadProject = async (projectCode: string, actor: { role: string; userId: number }) => {
  if (!projectCode) throw new ValidationError("Choose the project this sheet is for.");
  const [project] = await db.select().from(projects).where(eq(projects.code, projectCode));
  if (!project) throw new NotFoundError("Project", projectCode);

  await assertProjectWritable(projectCode);
  if (!["Construction", "Closeout"].includes(project.status)) {
    throw new ConflictError(
      `Attendance can only be logged while the project is in Construction or Closeout (currently ${project.status})`,
    );
  }

  // Site Personnel may only upload for a project they are staffed on.
  if (actor.role === "site-personnel") {
    const staffed = await projectMemberRepo.findAll({ projectCode, userId: actor.userId, role: "site-personnel" });
    if (staffed.length === 0) {
      throw new ForbiddenError(`You are not staffed on ${projectCode} as site personnel`);
    }
  }
  return project;
};

// ── Public API ───────────────────────────────────────────────────────────

const buildReport = async (
  buffer: Buffer,
  fileName: string,
  projectCode: string,
  actor: { role: string; userId: number },
) => {
  const project = await loadProject(projectCode, actor);
  const rows = await validateRows(await readWorkbook(buffer));
  const validRows = rows.filter((r) => r.errors.length === 0).length;
  const report: SheetReport = {
    projectCode,
    fileName,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    rows,
  };
  return { report, project };
};

/** Parse + validate only. Writes nothing. */
export const previewSheet = async (
  buffer: Buffer,
  fileName: string,
  projectCode: string,
  actor: { role: string; userId: number },
): Promise<SheetReport> => (await buildReport(buffer, fileName, projectCode, actor)).report;

/** Re-validates the sheet and stores every valid row. Invalid rows are skipped and reported. */
export const commitSheet = async (
  buffer: Buffer,
  fileName: string,
  projectCode: string,
  actor: { role: string; userId: number; name: string },
) => {
  const { report, project } = await buildReport(buffer, fileName, projectCode, actor);
  const valid = report.rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) {
    throw new ValidationError("None of the rows passed validation, so nothing was imported.");
  }

  for (const r of valid) {
    await repo.create({
      employeeId: r.workerId,
      site: project.name,
      projectCode,
      clockIn: r.timeIn ?? "00:00",
      clockOut: r.timeOut ?? undefined,
      hours: r.hours ?? undefined,
      logDate: r.date!,
      attendanceStatus: r.status,
      // No photo or coordinates stand behind a sheet entry: it is unmeasured
      // and unverified until HR confirms it.
      geofence: "Unverified",
      photo: "Not captured",
      status: "Pending",
      source: "Sheet",
      remarks: [`Imported from ${fileName} by ${actor.name}`, r.remarks].filter(Boolean).join(" — "),
    } as Parameters<typeof repo.create>[0]);
  }

  await logAudit({
    entityType: "attendance",
    entityId: projectCode,
    action: "imported",
    actor: actor.name,
    summary: `Imported ${valid.length} attendance record(s) from ${fileName} for ${projectCode} (${report.invalidRows} row(s) skipped)`,
    projectCode,
  });

  await notificationsService.create({
    recipientRole: "human-resources",
    projectCode,
    title: "Attendance sheet uploaded",
    body: `${valid.length} attendance record(s) for ${projectCode} were uploaded from a sheet and await verification.`,
    link: "/attendance",
  });

  return {
    imported: valid.length,
    skipped: report.invalidRows,
    totalRows: report.totalRows,
    skippedRows: report.rows.filter((r) => r.errors.length > 0),
  };
};

/** The downloadable template: header row, two example rows and an instructions sheet. */
export const buildTemplate = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EasyConstruct";

  const sheet = workbook.addWorksheet("Attendance");
  sheet.columns = [
    { header: "Worker ID", key: "workerId", width: 16 },
    { header: "Date", key: "date", width: 14 },
    { header: "Time In", key: "timeIn", width: 11 },
    { header: "Time Out", key: "timeOut", width: 11 },
    { header: "Status", key: "status", width: 12 },
    { header: "Remarks", key: "remarks", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const example = new Date(Date.now() - 86400 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  sheet.addRow({ workerId: "EMP-DEMO-01", date: example, timeIn: "08:00", timeOut: "17:00", status: "Present", remarks: "Example row — delete me" });
  sheet.addRow({ workerId: "EMP-DEMO-02", date: example, timeIn: "08:30", timeOut: "17:00", status: "Late", remarks: "" });

  // Dropdown on Status for the first 500 rows.
  for (let r = 2; r <= MAX_SHEET_ROWS + 1; r++) {
    sheet.getCell(`E${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${ATTENDANCE_STATUSES.join(",")}"`],
    };
  }

  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ width: 110 }];
  [
    "How to fill in the Attendance sheet",
    "",
    "• One row per worker per day. Keep the header row exactly as it is.",
    "• Worker ID: the employee ID from the HR roster (e.g. EMP-DEMO-01).",
    "• Date: YYYY-MM-DD. Not in the future and not more than " + MAX_BACKDATE_DAYS + " days ago.",
    "• Time In / Time Out: 24-hour HH:MM (e.g. 08:00, 17:30). Time Out must be after Time In.",
    "• Status: " + ATTENDANCE_STATUSES.join(", ") + ". Leave blank for Present. Absent and On Leave rows need no times.",
    "• Remarks: optional.",
    "• Up to " + MAX_SHEET_ROWS + " rows per upload. A worker can't appear twice for the same date, and dates already recorded are rejected.",
    "",
    "After uploading you'll see a preview with any row errors before anything is saved. Imported entries are marked Pending until HR verifies them.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 13 };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
};
