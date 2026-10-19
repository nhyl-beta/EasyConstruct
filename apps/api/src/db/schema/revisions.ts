// apps/api/src/db/schema/revisions.ts
//
// Immutable version history for the files an Architect produces. A revision is
// one uploaded version of one item (a design, a blueprint, a project document
// or a plan/drawing in the Documentation hub). History is never edited or
// deleted: a new upload is a new row, and the previous current version stops
// being current (and becomes "Superseded" unless it was already decided).
//
// design_revisions (the older table) is design-only, has no file and no
// project, and is left untouched; this table supersedes it for the Revisions
// page.
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const REVISION_ITEM_TYPES = ["design", "plan", "document", "blueprint"] as const;
export type RevisionItemType = (typeof REVISION_ITEM_TYPES)[number];

export const REVISION_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Superseded",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const revisions = pgTable(
  "revisions",
  {
    id: serial("id").primaryKey(),
    // projects.code — the app-wide convention is the text code, not a FK.
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    architectId: integer("architect_id")
      .notNull()
      .references(() => users.id),
    // Display-name snapshot so history still reads correctly if the user is renamed.
    createdByName: varchar("created_by_name", { length: 100 }).notNull(),

    // What is being versioned: designs.id / blueprints.id / documents.id /
    // architect_documents.id (for "plan"), per item_type.
    itemType: varchar("item_type", { length: 20 }).notNull(),
    itemId: integer("item_id").notNull(),
    itemTitle: varchar("item_title", { length: 255 }).notNull(),

    versionNumber: integer("version_number").notNull(),
    versionLabel: varchar("version_label", { length: 50 }),

    fileUrl: varchar("file_url", { length: 500 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size").notNull().default(0), // bytes
    mimeType: varchar("mime_type", { length: 100 }).notNull(),

    changeSummary: text("change_summary").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("Submitted"),

    reviewedBy: varchar("reviewed_by", { length: 100 }),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewComment: text("review_comment"),

    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("revisions_item_version_uq").on(t.itemType, t.itemId, t.versionNumber),
    // At most one current version per item.
    uniqueIndex("revisions_one_current_uq")
      .on(t.itemType, t.itemId)
      .where(sql`${t.isCurrent}`),
    index("revisions_project_idx").on(t.projectCode),
  ],
);

export type RevisionRow = typeof revisions.$inferSelect;
export type NewRevisionRow = typeof revisions.$inferInsert;
