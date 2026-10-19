// apps/api/src/db/schema/stored-files.ts (client demo change #2)
//
// One row per file the system stored, with the SHA-256 taken when it arrived. Downloads and "Check file"
// compare the bytes against it, so a file that was changed or corrupted afterwards is caught. A file with
// no row (uploaded before this existed, or by a path that could not hash it) is simply "unverified".
import { bigint, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const storedFiles = pgTable("stored_files", {
  id: serial("id").primaryKey(),
  url: varchar("url", { length: 1000 }).notNull().unique(),
  sha256: varchar("sha256", { length: 64 }),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  contentType: varchar("content_type", { length: 150 }),
  uploadedByUserId: integer("uploaded_by_user_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  // unverified | verified | damaged
  integrityStatus: varchar("integrity_status", { length: 12 }).notNull().default("unverified"),
  lastCheckedAt: timestamp("last_checked_at"),
});

export type StoredFile = typeof storedFiles.$inferSelect;
