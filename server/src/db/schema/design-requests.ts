// server/src/db/schema/design-requests.ts
//
// RFI / RFA requests and the transmittal cover sheet (the client's J.D. Legaspi
// forms). A request is raised by the PM or an Engineer and answered by the
// Architect or Consultant staffed on the project.
//
// `project_code` is the usual loose string reference (no FK), so the clean-slate
// reset deletes these tables explicitly (see scripts/reset-demo-data.ts).
// "Overdue" is derived from due_date + status and never stored; only the fact
// that the overdue notification went out is (overdue_notified_at).
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const designRequests = pgTable(
  "design_requests",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 3 }).notNull(), // RFI | RFA
    number: varchar("number", { length: 60 }).notNull().unique(),
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    discipline: varchar("discipline", { length: 2 }).notNull(), // AR ST EE ME PL CV ID
    sequence: integer("sequence").notNull(),
    sheetNumbers: varchar("sheet_numbers", { length: 255 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    sectionsReferenced: varchar("sections_referenced", { length: 255 }),
    requestText: text("request_text").notNull(),
    costImpact: varchar("cost_impact", { length: 10 }).notNull().default("none"), // none | increase | decrease
    costNote: varchar("cost_note", { length: 255 }),
    timeImpact: varchar("time_impact", { length: 10 }).notNull().default("none"),
    timeDays: integer("time_days"),
    requestedByUserId: integer("requested_by_user_id").references(() => users.id),
    requestedByName: varchar("requested_by_name", { length: 100 }).notNull(),
    requestedByRole: varchar("requested_by_role", { length: 30 }).notNull(),
    countersignedByUserId: integer("countersigned_by_user_id").references(() => users.id),
    countersignedByName: varchar("countersigned_by_name", { length: 100 }),
    countersignedAt: timestamp("countersigned_at"),
    assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
    assignedToName: varchar("assigned_to_name", { length: 100 }),
    dueDate: timestamp("due_date"),
    sentAt: timestamp("sent_at"),
    // draft | open | in_review | client_replied | answered | approved | approved_as_noted | rejected | closed
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    responseText: text("response_text"),
    respondedByUserId: integer("responded_by_user_id").references(() => users.id),
    respondedByName: varchar("responded_by_name", { length: 100 }),
    respondedAt: timestamp("responded_at"),
    returnedByName: varchar("returned_by_name", { length: 100 }),
    returnedByPosition: varchar("returned_by_position", { length: 100 }),
    returnedAt: timestamp("returned_at"),
    followUpOfId: integer("follow_up_of_id"),
    designId: integer("design_id"),
    overdueNotifiedAt: timestamp("overdue_notified_at"),
    // Client path: emailed to the project's client, who has no account. The
    // reply lands in the sender's mailbox and is never read by the system.
    recipientType: varchar("recipient_type", { length: 10 }).notNull().default("internal"), // internal | client
    recipientEmail: varchar("recipient_email", { length: 255 }),
    emailStatus: varchar("email_status", { length: 10 }).notNull().default("not_sent"), // not_sent | sent | failed
    emailResendCount: integer("email_resend_count").notNull().default(0),
    clientRepliedAt: timestamp("client_replied_at"),
    clientReminderNotifiedAt: timestamp("client_reminder_notified_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("design_requests_project_kind_disc_seq_uq").on(t.projectCode, t.kind, t.discipline, t.sequence)],
);

export const designRequestFiles = pgTable("design_request_files", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => designRequests.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 10 }).notNull().default("request"), // request | response
  url: varchar("url", { length: 500 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  uploadedByName: varchar("uploaded_by_name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// One row per person a client RFI/RFA is emailed to (client demo change #5). `design_requests.recipient_email`
// and `email_status` stay and are kept filled from the first recipient, so older screens keep working.
// `stakeholder_id` points at project_stakeholders when the person came from the project's list.
export const designRequestRecipients = pgTable(
  "design_request_recipients",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => designRequests.id, { onDelete: "cascade" }),
    stakeholderId: integer("stakeholder_id"),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailStatus: varchar("email_status", { length: 10 }).notNull().default("not_sent"), // not_sent | sent | failed
    sentAt: timestamp("sent_at"),
    resendCount: integer("resend_count").notNull().default(0),
    repliedAt: timestamp("replied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("design_request_recipients_request_idx").on(t.requestId)],
);

export type DesignRequestRecipient = typeof designRequestRecipients.$inferSelect;

export const transmittals = pgTable("transmittals", {
  id: serial("id").primaryKey(),
  controlNo: varchar("control_no", { length: 60 }).notNull().unique(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  sequence: integer("sequence").notNull(),
  dateIssued: varchar("date_issued", { length: 10 }).notNull(), // YYYY-MM-DD
  location: varchar("location", { length: 255 }),
  toName: varchar("to_name", { length: 255 }).notNull(),
  thruName: varchar("thru_name", { length: 255 }),
  type: varchar("type", { length: 20 }).notNull().default("inter-office"), // inter-office | inter-agency
  subject: varchar("subject", { length: 255 }).notNull(),
  purposes: jsonb("purposes").$type<string[]>().notNull().default([]),
  purposeOther: varchar("purpose_other", { length: 255 }),
  transmittedByUserId: integer("transmitted_by_user_id").references(() => users.id),
  transmittedByName: varchar("transmitted_by_name", { length: 100 }).notNull(),
  receivedByName: varchar("received_by_name", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | issued | acknowledged
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transmittalItems = pgTable("transmittal_items", {
  id: serial("id").primaryKey(),
  transmittalId: integer("transmittal_id")
    .notNull()
    .references(() => transmittals.id, { onDelete: "cascade" }),
  requestId: integer("request_id"),
  particulars: text("particulars").notNull(),
  remarks: varchar("remarks", { length: 255 }),
  position: integer("position").notNull().default(0),
});

export const transmittalAcknowledgements = pgTable("transmittal_acknowledgements", {
  id: serial("id").primaryKey(),
  transmittalId: integer("transmittal_id")
    .notNull()
    .references(() => transmittals.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  signature: varchar("signature", { length: 255 }),
  office: varchar("office", { length: 255 }),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
});

export type DesignRequest = typeof designRequests.$inferSelect;
export type NewDesignRequest = typeof designRequests.$inferInsert;
export type DesignRequestFile = typeof designRequestFiles.$inferSelect;
export type Transmittal = typeof transmittals.$inferSelect;
export type TransmittalItem = typeof transmittalItems.$inferSelect;
export type TransmittalAcknowledgement = typeof transmittalAcknowledgements.$inferSelect;
