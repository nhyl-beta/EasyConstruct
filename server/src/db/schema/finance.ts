import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { requirements, type RequirementAttachment } from "./requirements.js";

export const budgetStatusEnum = pgEnum("budget_status", [
  "draft",
  "pending-review",
  "finance-review",
  "manager-review",
  "approved",
  "rejected",
  "locked",
]);

export const adjustmentKindEnum = pgEnum("adjustment_kind", [
  "increase",
  "decrease",
  "transfer",
  "emergency",
]);

// ── Budgets ────────────────────────────────────────────────────────────────
export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),

  project: varchar("project", { length: 255 }).notNull(),

  category: varchar("category", { length: 64 }).notNull(),
  owner: varchar("owner", { length: 255 }).notNull(),

  planned: numeric("planned", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  committed: numeric("committed", {
    precision: 14,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),

  actual: numeric("actual", {
    precision: 14,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),

  fiscalYear: varchar("fiscal_year", { length: 9 }).notNull(),

  status: budgetStatusEnum("status").notNull().default("draft"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Expenses ───────────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: varchar("id", { length: 32 }).primaryKey(), // e.g. "EXP-0182"
  vendor: varchar("vendor", { length: 255 }).notNull(),
  project: varchar("project", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).notNull(), // pending | approved | rejected
  anomalyScore: real("anomaly_score"), // 0-1, nullable
  // Plain-language reasons behind a non-zero score (finance/expenses/anomaly.ts).
  anomalyReason: text("anomaly_reason"),
  receiptUrl: text("receipt_url"),
  // Where the spend came from: a direct ledger entry ("manual"), a paid
  // procurement order, or (retired) a paid reimbursement. (source_type, source_id) is
  // unique so a payment can never create two expenses.
  sourceType: varchar("source_type", { length: 32 }).notNull().default("manual"),
  sourceId: varchar("source_id", { length: 32 }),
}, (t) => [
  uniqueIndex("expenses_source_unique").on(t.sourceType, t.sourceId).where(sql`${t.sourceId} IS NOT NULL`),
]);

// ── Purchase requests ──────────────────────────────────────────────────────
export const purchaseRequests = pgTable("purchase_requests", {
  id: varchar("id", { length: 32 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  project: varchar("project", { length: 255 }).notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  // pending-pm | pending-finance | approved | rejected | ordered | cancelled
  category: varchar("category", { length: 64 }),
  requirementId: integer("requirement_id").references(() => requirements.id),
  // `amount` is computed on the server from these.
  lineItems: jsonb("line_items").$type<PurchaseLineItem[]>().notNull().default([]),
  neededBy: date("needed_by", { mode: "string" }),
  justification: text("justification"),
  preferredVendor: varchar("preferred_vendor", { length: 255 }),
  requestedByUserId: integer("requested_by_user_id"),
  requestedByRole: varchar("requested_by_role", { length: 40 }),
  endorsedBy: varchar("endorsed_by", { length: 255 }),
  endorsedAt: timestamp("endorsed_at"),
  decidedBy: varchar("decided_by", { length: 255 }),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),
  overBudget: boolean("over_budget").notNull().default(false),
  // Money this request currently holds in budgets.committed.
  committedAmount: numeric("committed_amount", { precision: 14, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface PurchaseLineItem {
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
}

// ── Reimbursements (feature removed) ────────────────────────────────────────
// The reimbursement claims feature was removed from the application. This
// table is RETAINED, unused, so the schema still matches the database (no
// migration drops it). Old rows are cleared by the owner with
// scripts/remove-claims-data.ts or server/scripts/sql/remove-claims.sql.
export const reimbursements = pgTable("reimbursements", {
  id: varchar("id", { length: 32 }).primaryKey(),
  employee: varchar("employee", { length: 255 }).notNull(),
  purpose: varchar("purpose", { length: 255 }).notNull(),
  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  // pending-pm | pending-finance | approved | rejected | paid | cancelled
  claimantUserId: integer("claimant_user_id"),
  claimantRole: varchar("claimant_role", { length: 40 }),
  project: varchar("project", { length: 255 }),
  category: varchar("category", { length: 64 }),
  incurredOn: date("incurred_on", { mode: "string" }),
  // Receipts: same shape as requirements.attachments.
  attachments: jsonb("attachments").$type<ClaimAttachment[]>().notNull().default([]),
  endorsedBy: varchar("endorsed_by", { length: 255 }),
  endorsedAt: timestamp("endorsed_at"),
  decidedBy: varchar("decided_by", { length: 255 }),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),
  paidAt: timestamp("paid_at"),
  paidBy: varchar("paid_by", { length: 255 }),
  paymentReference: varchar("payment_reference", { length: 128 }),
  expenseId: varchar("expense_id", { length: 32 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Receipts use the requirement attachment shape (files go through POST /api/uploads).
export type ClaimAttachment = RequirementAttachment;

// ── Procurement orders ─────────────────────────────────────────────────────
export const procurementOrders = pgTable("procurement_orders", {
  id: varchar("id", { length: 32 }).primaryKey(), // PO number
  vendor: varchar("vendor", { length: 255 }).notNull(),
  project: varchar("project", { length: 255 }).notNull(),
  items: integer("items").notNull(),
  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  eta: varchar("eta", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull(), // ordered | in-transit | delivered | paid | cancelled
  purchaseRequestId: varchar("purchase_request_id", { length: 32 }).unique(),
  category: varchar("category", { length: 64 }),
  lineItems: jsonb("line_items").$type<PurchaseLineItem[]>().notNull().default([]),
  etaDate: date("eta_date", { mode: "string" }),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  receivedByUserId: integer("received_by_user_id"),
  receivedBy: varchar("received_by", { length: 255 }),
  deliveryNote: text("delivery_note"),
  deliveryReceiptUrl: text("delivery_receipt_url"),
  invoiceNumber: varchar("invoice_number", { length: 128 }),
  invoiceAmount: numeric("invoice_amount", { precision: 14, scale: 2, mode: "number" }),
  varianceNote: text("variance_note"),
  paidAt: timestamp("paid_at"),
  paidBy: varchar("paid_by", { length: 255 }),
  expenseId: varchar("expense_id", { length: 32 }),
  createdBy: varchar("created_by", { length: 255 }),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Approvals queue ────────────────────────────────────────────────────────
export const approvalsQueue = pgTable("approvals_queue", {
  id: varchar("id", { length: 32 }).primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(), // Budget | Payroll | Expense | ...
  reference: varchar("reference", { length: 255 }).notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).notNull(),
  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  slaHours: integer("sla_hours").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── AI insights ────────────────────────────────────────────────────────────
export const aiInsights = pgTable("ai_insights", {
  id: varchar("id", { length: 32 }).primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  impact: text("impact").notNull(),
  confidence: real("confidence").notNull(), // 0-1
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Financial risks ────────────────────────────────────────────────────────
export const financialRisks = pgTable("financial_risks", {
  id: varchar("id", { length: 32 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  impact: text("impact").notNull(),
  project: varchar("project", { length: 255 }).notNull(),
  level: varchar("level", { length: 16 }).notNull(), // low | medium | high | critical
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Cash flow entries (monthly rollups) ────────────────────────────────────
export const cashFlowEntries = pgTable("cash_flow_entries", {
  id: serial("id").primaryKey(),
  month: varchar("month", { length: 16 }).notNull().unique(), // "Jan 2026"
  inflow: numeric("inflow", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
  outflow: numeric("outflow", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),
});

// ── Scheduled reports ──────────────────────────────────────────────────────
export const scheduledReports = pgTable("scheduled_reports", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  cadence: varchar("cadence", { length: 64 }).notNull(), // "Every Mon", "1st of month", ...
  time: varchar("time", { length: 16 }).notNull(), // "07:00"
  recipients: text("recipients"), // comma-separated or jsonb later
});

// ── Budget allocations ─────────────────────────────────────────────────────
export const budgetAllocations = pgTable("budget_allocations", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  department: varchar("department", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),

  amount: numeric("amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  consumed: numeric("consumed", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  status: varchar("status", { length: 32 }).notNull().default("active"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Budget adjustments ─────────────────────────────────────────────────────
export const budgetAdjustments = pgTable("budget_adjustments", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  kind: adjustmentKindEnum("kind").notNull(),

  originalAmount: numeric("original_amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  adjustmentAmount: numeric("adjustment_amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  newAmount: numeric("new_amount", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  reason: text("reason").notNull(),

  requestedBy: varchar("requested_by", {
    length: 255,
  }).notNull(),

  requestedAt: timestamp("requested_at").defaultNow().notNull(),

  approvedBy: varchar("approved_by", {
    length: 255,
  }),

  approvedAt: timestamp("approved_at"),

  status: budgetStatusEnum("status").notNull().default("draft"),
});

// ── Budget approval workflow ───────────────────────────────────────────────
export const budgetApprovalSteps = pgTable("budget_approval_steps", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  stage: varchar("stage", {
    length: 32,
  }).notNull(),

  decision: varchar("decision", {
    length: 16,
  }),

  actor: varchar("actor", {
    length: 255,
  }),

  comment: text("comment"),

  decidedAt: timestamp("decided_at"),
});

// ── Budget history / audit log ─────────────────────────────────────────────
export const budgetHistory = pgTable("budget_history", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  action: varchar("action", {
    length: 32,
  }).notNull(),

  field: varchar("field", {
    length: 64,
  }),

  oldValue: varchar("old_value", {
    length: 255,
  }),

  newValue: varchar("new_value", {
    length: 255,
  }),

  reason: text("reason"),

  actor: varchar("actor", {
    length: 255,
  }).notNull(),

  at: timestamp("at").defaultNow().notNull(),
});

// ── Budget comments ────────────────────────────────────────────────────────
export const budgetComments = pgTable("budget_comments", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  author: varchar("author", {
    length: 255,
  }).notNull(),

  body: text("body").notNull(),

  at: timestamp("at").defaultNow().notNull(),
});

// ── Budget documents ───────────────────────────────────────────────────────
export const budgetDocuments = pgTable("budget_documents", {
  id: serial("id").primaryKey(),

  budgetId: integer("budget_id")
    .notNull()
    .references(() => budgets.id),

  name: varchar("name", {
    length: 255,
  }).notNull(),

  kind: varchar("kind", {
    length: 64,
  }),

  size: varchar("size", {
    length: 32,
  }),

  uploadedBy: varchar("uploaded_by", {
    length: 255,
  }).notNull(),

  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),

  url: text("url"),
});

// ── Payroll batches ────────────────────────────────────────────────────────
export const payrollBatches = pgTable("payroll_batches", {
  id: varchar("id", { length: 32 }).primaryKey(), // e.g. "PAY-2048"

  // Optional project reference for project-based payroll
  projectCode: varchar("project_code", { length: 50 }),

  period: varchar("period", { length: 32 }).notNull(), // e.g. "Jul 20–26, 2026"

  group: varchar("group", { length: 128 }).notNull(), // Engineering, Site Crew A, etc.

  employees: integer("employees").notNull(),

  overtimeHours: numeric("overtime_hours", {
    precision: 10,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),

  grossPayroll: numeric("gross_payroll", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  deductions: numeric("deductions", {
    precision: 14,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),

  netPayroll: numeric("net_payroll", {
    precision: 14,
    scale: 2,
    mode: "number",
  }).notNull(),

  status: varchar("status", { length: 32 })
    .notNull()
    .default("pending"), // draft | pending | approved | revision_required

  reviewedBy: varchar("reviewed_by", { length: 255 }),

  reviewedAt: timestamp("reviewed_at"),

  // G1: Finance's review comment (optional on approve) / rejection reason
  // (required on reject, enforced client-side) — was accepted by the API
  // (DecidePayrollBatchInput.comment) but never persisted at all before this.
  reviewNote: text("review_note"),

  // Submission round: starts at 1, +1 each time HR resubmits after a
  // rejection. Finance decisions are recorded against it.
  round: integer("round").notNull().default(1),

  // Total employer labor cost (gross + employer statutory contributions) —
  // what an approval books against the project's Labor budget.
  employerCost: numeric("employer_cost", {
    precision: 14,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),

  submittedAt: timestamp("submitted_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// ── Expense categories ─────────────────────────────────────────────────────
// The one managed list behind every category dropdown. The category columns on
// budgets, expenses, purchase requests, reimbursements and orders stay free
// text (no foreign key): a budget line is still matched by project + category
// string equality. Writes are validated against this table instead.
export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Protected: cannot be retired or renamed (payroll books against "Labor").
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("expense_categories_name_lower_unique").on(sql`lower(${t.name})`),
]);
