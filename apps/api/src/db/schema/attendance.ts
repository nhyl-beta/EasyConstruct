// apps/api/src/db/schema/attendance.ts
import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id", { length: 20 }).notNull(),
  site: varchar("site", { length: 255 }).notNull(),
  projectCode: varchar("project_code", { length: 50 }),
  clockIn: varchar("clock_in", { length: 10 }).notNull(),
  clockOut: varchar("clock_out", { length: 10 }),
  hours: numeric("hours", { precision: 4, scale: 1 }),
  geofence: varchar("geofence", { length: 20 }).notNull().default("Inside"),
  photo: varchar("photo", { length: 20 }).notNull().default("Pending"),
  status: varchar("status", { length: 20 }).notNull().default("Pending"),
  attendanceStatus: varchar("attendance_status", { length: 20 })
    .notNull()
    .default("Present"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  distanceFromSiteM: integer("distance_from_site_m"),
  photoUrl: varchar("photo_url", { length: 500 }),
  remarks: text("remarks"),
  logDate: date("log_date").notNull(),
  // Where the record came from: a live "Clock-in" (photo + geofence) or a
  // "Sheet" imported from a site attendance spreadsheet (no photo/geofence,
  // so HR sees it needs verification — see attendance/import.ts).
  source: varchar("source", { length: 20 }).notNull().default("Clock-in"),
  createdAt: timestamp("created_at").defaultNow(),
  // E1: a client-generated UUID an offline-queued clock-in/out carries so a
  // retried sync (the device coming back online more than once before the
  // server ack is confirmed) never creates a duplicate attendance record.
  // Nullable + unique. A plain UNIQUE constraint on Postgres treats every
  // NULL as distinct from every other NULL, so online submissions (which
  // never set this) never collide with each other — only two equal,
  // non-null client-generated ids would conflict, which is exactly the
  // idempotent-replay case this column exists for.
  clientRequestId: varchar("client_request_id", { length: 64 }).unique(),
  // True when the geofence Inside/Outside check above was computed on the
  // device against cached site coordinates while offline, not derived fresh
  // server-side — lets HR/PM tell an offline-validated entry apart from a
  // normally-verified one for review.
  validatedOffline: boolean("validated_offline").notNull().default(false),
});

export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;