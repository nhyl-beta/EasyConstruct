import { apiClient } from "@/services/api.client";

export type AttendanceStatus = "Present" | "Absent" | "Late" | "On Leave" | "Half Day";

export interface AttendanceEntry {
  id: number;
  employeeId: string;
  name: string;
  initials: string;
  site: string;
  clockIn: string;
  clockOut: string | null;
  hours: number;
  geofence: string;
  photo: string;
  status: string; // verification status: Verified | Pending | Flagged
  attendanceStatus: AttendanceStatus;
  remarks: string | null;
  logDate: string;
  photoUrl: string | null;
  // The clock-in's recorded position and how far it was from the project's
  // registered site. The API has always returned these; the normalizer below
  // dropped them, so HR's attendance review could show a geofence verdict but
  // never the location it was based on.
  latitude: number | null;
  longitude: number | null;
  distanceFromSiteM: number | null;
  /** "Clock-in" (live, photo + geofence) or "Sheet" (imported from a site attendance spreadsheet). */
  source: string;
}

export interface AttendanceQuery {
  employeeId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateAttendanceInput {
  employeeId: string;
  site: string;
  clockIn: string;
  clockOut?: string;
  attendanceStatus?: AttendanceStatus;
  remarks?: string;
  logDate: string;
}

interface BackendAttendance {
  id: number;
  employeeId: string;
  site: string;
  clockIn: string;
  clockOut: string | null;
  hours: string | number | null;
  geofence: string;
  photo: string;
  status: string;
  attendanceStatus: string;
  remarks: string | null;
  logDate: string;
  photoUrl: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  distanceFromSiteM: number | null;
  source?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

function normalize(raw: BackendAttendance, nameLookup: Map<string, { name: string; initials: string }>): AttendanceEntry {
  const person = nameLookup.get(raw.employeeId);
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    name: person?.name ?? raw.employeeId,
    initials: person?.initials ?? "NA",
    site: raw.site,
    clockIn: raw.clockIn,
    clockOut: raw.clockOut,
    hours: raw.hours != null ? Number(raw.hours) : 0,
    geofence: raw.geofence,
    photo: raw.photo,
    status: raw.status,
    attendanceStatus: (raw.attendanceStatus as AttendanceStatus) ?? "Present",
    remarks: raw.remarks,
    logDate: raw.logDate,
    photoUrl: raw.photoUrl ?? null,
    // numeric() columns arrive as strings from drizzle.
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    distanceFromSiteM: raw.distanceFromSiteM ?? null,
    source: raw.source ?? "Clock-in",
  };
}

export async function listAttendance(
  query: AttendanceQuery = {},
  nameLookup: Map<string, { name: string; initials: string }> = new Map(),
): Promise<AttendanceEntry[]> {
  const params = new URLSearchParams();
  if (query.employeeId) params.set("employeeId", query.employeeId);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  const qs = params.toString();
  const raw = await unwrap<BackendAttendance[]>(
    apiClient.get(`/attendance${qs ? `?${qs}` : ""}`),
  );
  return raw.map((r) => normalize(r, nameLookup));
}

export interface AttendancePageQuery extends AttendanceQuery {
  page: number;
  pageSize: number;
  /** Employee id, name or site. */
  search?: string;
  /** Verification status: Verified | Pending | Flagged. */
  verification?: string;
}

export interface AttendanceSummary {
  verified: number;
  pending: number;
  flagged: number;
  geofenceFlags: number;
  photoFailures: number;
  /** Pending clock-ins with no geofence breach or failed photo — what Bulk verify will verify. */
  bulkVerifiable: number;
}

export interface AttendancePage {
  items: AttendanceEntry[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** Counts across the whole filtered set, not just this page. */
  summary: AttendanceSummary;
}

/** Server-side pagination: one page of the filtered list (GET /attendance?page=…). */
export async function listAttendancePage(
  query: AttendancePageQuery,
  nameLookup: Map<string, { name: string; initials: string }> = new Map(),
): Promise<AttendancePage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set("search", query.search);
  if (query.verification && query.verification !== "all") params.set("verification", query.verification);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  const json = (await apiClient.get(`/attendance?${params.toString()}`)) as {
    data: BackendAttendance[];
    meta: Omit<AttendancePage, "items">;
  };
  return { items: json.data.map((r) => normalize(r, nameLookup)), ...json.meta };
}

/** One attendance record by id (the record an "outside the radius" alert points at). */
export async function getAttendanceRecord(id: number): Promise<{ id: number; employeeId: string; logDate: string }> {
  return unwrap<{ id: number; employeeId: string; logDate: string }>(apiClient.get(`/attendance/${id}`));
}

export interface AttendanceHeatmap {
  days: string[];
  sites: { site: string; total: number; max: number; cells: { day: string; count: number }[] }[];
  onTimeRate: number | null;
  lateArrivalsPerDay: number | null;
  avgShiftHours: number | null;
}

export async function getAttendanceHeatmap(): Promise<AttendanceHeatmap> {
  return unwrap<AttendanceHeatmap>(apiClient.get("/attendance/heatmap"));
}

/** Verifies every pending clock-in with no geofence breach or failed photo. Returns how many. */
export async function bulkVerifyAttendance(filters: { search?: string } = {}): Promise<number> {
  const result = await unwrap<{ verified: number }>(apiClient.post("/attendance/bulk-verify", filters));
  return result.verified;
}

export async function createAttendance(input: CreateAttendanceInput): Promise<void> {
  await apiClient.post("/attendance", input);
}

/**
 * Records HR's verification outcome for a clock-in. `status` is the review
 * verdict (Verified | Flagged | Pending), distinct from `attendanceStatus`
 * (Present | Absent | …) which describes the working day itself.
 */
export async function setAttendanceVerification(
  id: number,
  status: "Verified" | "Flagged" | "Pending",
  remarks?: string,
): Promise<void> {
  await apiClient.patch(`/attendance/${id}`, {
    status,
    ...(remarks !== undefined ? { remarks } : {}),
  });
}

// ── Exceptions (objectives fix 2.3) ──────────────────────────────────────

export type ExceptionKind =
  | "missing_clock_out"
  | "late"
  | "outside_geofence"
  | "duplicate_entry"
  | "missing_photo"
  | "absent_task_due"
  | "likely_absent";

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  missing_clock_out: "Missing clock-out",
  late: "Late",
  outside_geofence: "Outside geofence",
  duplicate_entry: "Duplicate entry",
  missing_photo: "Missing photo",
  absent_task_due: "Absent, task due",
  likely_absent: "Likely absent",
};

export interface AttendanceExceptionItem {
  kind: ExceptionKind;
  recordId: number | null;
  employeeId: string;
  employeeName: string;
  logDate: string;
  projectCode: string | null;
  message: string;
}

export interface AttendanceExceptionPage {
  items: AttendanceExceptionItem[];
  total: number;
  page: number;
  pages: number;
  summary: Record<ExceptionKind, number>;
  from: string;
  to: string;
  rules: { shiftStart: string; lateGraceMinutes: number };
}

export async function listAttendanceExceptions(query: {
  page: number;
  pageSize: number;
  kind?: string;
}): Promise<AttendanceExceptionPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.kind && query.kind !== "all") params.set("kind", query.kind);
  const json = (await apiClient.get(`/attendance/exceptions?${params.toString()}`)) as {
    data: AttendanceExceptionItem[];
    meta: Omit<AttendanceExceptionPage, "items">;
  };
  return { items: json.data, ...json.meta };
}

/** HR confirms a likely absence. Creates the record through the normal attendance service. */
export async function markAbsent(input: {
  employeeId: string;
  projectCode: string;
  logDate: string;
  remarks?: string;
}): Promise<void> {
  await apiClient.post("/attendance/mark-absent", input);
}
