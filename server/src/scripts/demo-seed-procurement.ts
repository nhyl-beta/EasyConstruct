// server/src/scripts/demo-seed-procurement.ts
//
// Demo data for purchase requests, procurement orders and reimbursement claims,
// on a demo database only (assertDemoDatabase refuses anything that is not
// local or listed in DEMO_RESET_ALLOWED_HOSTS, and needs ALLOW_DEMO_RESET=true).
//
// Everything is on DEMO-S4 (Construction) and covers every status:
//   * 12 purchase requests: pending PM, pending Finance, approved, an approved
//     one that is over budget (no PPE budget line), rejected, cancelled, and six
//     that reached an order;
//   * 5 orders: ordered, in transit, delivered, paid (with the approved expense
//     it created) and cancelled;
//   * 6 claims: one in each status, the paid one with its expense.
// Budgets are kept consistent with it: approved and ordered requests hold their
// amount in `committed`, paid ones moved it into `actual`.
//
// Insert-only and idempotent: a row whose id already exists is skipped, and the
// budget / cash-flow effects of a row are applied only when that row is new.
// Nothing is deleted or rewritten; users and roles are only read.
//
// Needs migration 0025 applied (ensure-demo-schema.ts runs it for a demo database).
//
// Usage:  npm run demo:seed-procurement -- --dry-run
//         npm run demo:seed-procurement
import "dotenv/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  budgets,
  expenses,
  procurementOrders,
  purchaseRequests,
  reimbursements,
  type PurchaseLineItem,
} from "../db/schema/finance.js";
import { requirements } from "../db/schema/requirements.js";
import { users } from "../db/schema/users.js";
import { monthKey } from "../finance/cash-flow/months.js";
import { refreshMonth } from "../finance/cash-flow/service.js";
import { lineItemsTotal } from "../finance/purchasing/rules.js";
import { assertDemoDatabase } from "./demo-guard.js";
import { EMAILS } from "./demo-seed-lib.js";

const DRY = process.argv.includes("--dry-run");
const PROJECT = "DEMO-S4";
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const isoDay = (days: number) => ago(days).toISOString().slice(0, 10);

type Person = { id: number; name: string; role: string };
const lines = (...l: [string, number, string, number][]): PurchaseLineItem[] =>
  l.map(([description, qty, unit, unitCost]) => ({ description, qty, unit, unitCost }));

interface OrderPlan {
  id: string;
  vendor: string;
  status: "ordered" | "in-transit" | "delivered" | "paid" | "cancelled";
  etaInDays: number;
  /** Order lines; defaults to the request's lines. */
  lines?: PurchaseLineItem[];
  invoiceAmount?: number;
  varianceNote?: string;
  expenseId?: string;
}

interface PrPlan {
  id: string;
  title: string;
  category: "Materials" | "Equipment" | "PPE" | "Transport" | "Services";
  status: "pending-pm" | "pending-finance" | "approved" | "rejected" | "ordered" | "cancelled";
  lines: PurchaseLineItem[];
  raisedBy: "engineer" | "pm";
  ageDays: number;
  overBudget?: boolean;
  note?: string;
  order?: OrderPlan;
}

const PLANS: PrPlan[] = [
  { id: "PR-D001", title: "Rebar for level 3 slab", category: "Materials", status: "pending-pm", raisedBy: "engineer", ageDays: 1, lines: lines(["16mm rebar", 6, "ton", 52_000]) },
  { id: "PR-D002", title: "Formwork plywood", category: "Materials", status: "pending-finance", raisedBy: "engineer", ageDays: 3, lines: lines(["Marine plywood 3/4in", 120, "sheet", 1_450]) },
  { id: "PR-D003", title: "Concrete pump rental", category: "Equipment", status: "pending-finance", raisedBy: "pm", ageDays: 2, lines: lines(["Boom pump, 2 days", 2, "day", 38_000]) },
  { id: "PR-D004", title: "Safety helmets and harnesses", category: "PPE", status: "approved", raisedBy: "engineer", ageDays: 6, overBudget: true, note: "No PPE budget line on this project; approved against contingency by agreement.", lines: lines(["Safety helmet", 40, "pc", 450], ["Full-body harness", 12, "pc", 2_800]) },
  { id: "PR-D005", title: "Cement, 40 kg bags", category: "Materials", status: "approved", raisedBy: "engineer", ageDays: 5, lines: lines(["Portland cement 40kg", 800, "bag", 285]) },
  { id: "PR-D006", title: "Aggregate delivery", category: "Materials", status: "ordered", raisedBy: "engineer", ageDays: 12, lines: lines(["3/4in gravel", 60, "cu.m", 1_300]), order: { id: "PO-D001", vendor: "Pasig Aggregates", status: "in-transit", etaInDays: 2 } },
  { id: "PR-D007", title: "Hollow blocks", category: "Materials", status: "ordered", raisedBy: "engineer", ageDays: 14, lines: lines(["CHB 6in", 4_000, "pc", 16]), order: { id: "PO-D002", vendor: "Marikina Blockworks", status: "delivered", etaInDays: -1 } },
  { id: "PR-D008", title: "Steel tie wire and nails", category: "Materials", status: "ordered", raisedBy: "pm", ageDays: 25, lines: lines(["Tie wire #16", 30, "roll", 2_100], ["Common nails", 40, "kg", 95]), order: { id: "PO-D003", vendor: "ABC Steel Supply", status: "paid", etaInDays: -10, invoiceAmount: 69_400, varianceNote: "Invoice includes P3,300 fuel surcharge.", expenseId: "EXP-D001" } },
  { id: "PR-D009", title: "Waterproofing membrane", category: "Materials", status: "ordered", raisedBy: "engineer", ageDays: 2, lines: lines(["Torch-on membrane", 90, "roll", 1_850]), order: { id: "PO-D004", vendor: "Sealtech Trading", status: "ordered", etaInDays: 9 } },
  { id: "PR-D010", title: "Scaffolding set", category: "Equipment", status: "approved", raisedBy: "pm", ageDays: 9, lines: lines(["Scaffolding frame set", 24, "set", 3_900]), order: { id: "PO-D005", vendor: "Rizal Rentals", status: "cancelled", etaInDays: 0 } },
  { id: "PR-D011", title: "Decorative tiles", category: "Materials", status: "rejected", raisedBy: "engineer", ageDays: 8, note: "Not in the approved scope for this phase.", lines: lines(["Ceramic tile 60x60", 300, "box", 780]) },
  { id: "PR-D012", title: "Hauling of excavated soil", category: "Transport", status: "cancelled", raisedBy: "engineer", ageDays: 11, lines: lines(["Dump truck trips", 20, "trip", 2_500]) },
];

interface ClaimPlan {
  id: string;
  // Only Engineers and Site Personnel can file claims (finance/reimbursements/routes.ts).
  claimant: "engineer" | "site";
  status: "pending-pm" | "pending-finance" | "approved" | "rejected" | "paid" | "cancelled";
  purpose: string;
  category: "Materials" | "Equipment" | "PPE" | "Transport" | "Services";
  amount: number;
  ageDays: number;
  note?: string;
  expenseId?: string;
}

const CLAIMS: ClaimPlan[] = [
  { id: "RMB-D001", claimant: "site", status: "pending-pm", purpose: "Nails and tie wire bought on site", category: "Materials", amount: 1_240, ageDays: 1 },
  { id: "RMB-D002", claimant: "engineer", status: "pending-finance", purpose: "Taxi to the supplier for a sample check", category: "Transport", amount: 860, ageDays: 3 },
  { id: "RMB-D003", claimant: "engineer", status: "approved", purpose: "Printing of drawing sets for the client meeting", category: "Services", amount: 3_150, ageDays: 5 },
  { id: "RMB-D004", claimant: "site", status: "rejected", purpose: "Team lunch", category: "Services", amount: 2_400, ageDays: 7, note: "Meals are not reimbursable." },
  { id: "RMB-D005", claimant: "site", status: "paid", purpose: "Emergency repair of the water pump hose", category: "Equipment", amount: 1_875, ageDays: 15, expenseId: "EXP-D002" },
  { id: "RMB-D006", claimant: "site", status: "cancelled", purpose: "Duplicate of an earlier claim", category: "Transport", amount: 540, ageDays: 4 },
];

const key = (category: string) => `${PROJECT}|${category}`;

async function person(email: string): Promise<Person> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`Demo account ${email} not found. Run the account seed first.`);
  return { id: u.id, name: u.name, role: u.role };
}

async function main() {
  assertDemoDatabase();
  const engineer = await person(EMAILS.engineer);
  const site = await person(EMAILS.site);
  const pm = await person(EMAILS.pm);
  const finance = await person(EMAILS.finance);
  const claimants = { engineer, site };

  const existing = new Set<string>([
    ...(await db.select({ id: purchaseRequests.id }).from(purchaseRequests)).map((r) => r.id),
    ...(await db.select({ id: procurementOrders.id }).from(procurementOrders)).map((r) => r.id),
    ...(await db.select({ id: reimbursements.id }).from(reimbursements)).map((r) => r.id),
    ...(await db.select({ id: expenses.id }).from(expenses).where(inArray(expenses.id, ["EXP-D001", "EXP-D002"]))).map((r) => r.id),
  ]);

  const fresh = {
    requests: PLANS.filter((p) => !existing.has(p.id)),
    orders: PLANS.flatMap((p) => (p.order && !existing.has(p.order.id) ? [p] : [])),
    claims: CLAIMS.filter((c) => !existing.has(c.id)),
  };
  console.log(
    `Plan: ${fresh.requests.length} request(s), ${fresh.orders.length} order(s), ${fresh.claims.length} claim(s) to add; the rest already exist.`,
  );
  if (DRY || (fresh.requests.length === 0 && fresh.orders.length === 0 && fresh.claims.length === 0)) {
    console.log(DRY ? "\nDry run: nothing written." : "\nNothing to do.");
    return;
  }

  // Budget effects, per project + category, applied once at the end.
  const committed = new Map<string, number>();
  const actual = new Map<string, number>();
  const bump = (m: Map<string, number>, category: string, amount: number) => m.set(key(category), (m.get(key(category)) ?? 0) + amount);

  await db.transaction(async (tx) => {
    let n = 0;
    for (const plan of PLANS) {
      const amount = lineItemsTotal(plan.lines);
      const raiser = plan.raisedBy === "engineer" ? engineer : pm;
      const reqKey = `DEMO-PUR-${String(++n).padStart(2, "0")}`;

      // The Approved requirement each request was raised from.
      let [req] = await tx.select().from(requirements).where(eq(requirements.requirementId, reqKey));
      if (!req) {
        [req] = await tx
          .insert(requirements)
          .values({ requirementId: reqKey, title: plan.title, project: PROJECT, category: plan.category, description: `Supply: ${plan.title}.`, status: "Approved", createdBy: engineer.name })
          .returning();
      }

      if (!existing.has(plan.id)) {
        const order = plan.order;
        const heldByOrder = order && order.status !== "cancelled" ? lineItemsTotal(order.lines ?? plan.lines) : 0;
        // An approved request holds its amount even when no budget line can count it (over budget).
        const holdsMoney = plan.status === "approved";
        const committedAmount = order ? (order.status === "paid" || order.status === "cancelled" ? 0 : heldByOrder) : holdsMoney ? amount : 0;
        // A cancelled order puts its request back to approved with the full amount held again.
        const effectiveStatus = order?.status === "cancelled" ? "approved" : plan.status;
        const effectiveCommitted = order?.status === "cancelled" ? amount : committedAmount;

        await tx.insert(purchaseRequests).values({
          id: plan.id,
          title: plan.title,
          project: PROJECT,
          requestedBy: raiser.name,
          amount,
          requestedAt: ago(plan.ageDays),
          status: effectiveStatus,
          category: plan.category,
          requirementId: req!.id,
          lineItems: plan.lines,
          neededBy: isoDay(-14),
          justification: `Needed for ${plan.title.toLowerCase()}.`,
          requestedByUserId: raiser.id,
          requestedByRole: raiser.role,
          endorsedBy: plan.raisedBy === "engineer" && plan.status !== "pending-pm" ? pm.name : null,
          endorsedAt: plan.raisedBy === "engineer" && plan.status !== "pending-pm" ? ago(Math.max(0, plan.ageDays - 1)) : null,
          decidedBy: ["approved", "ordered", "rejected"].includes(plan.status) ? finance.name : null,
          decidedAt: ["approved", "ordered", "rejected"].includes(plan.status) ? ago(Math.max(0, plan.ageDays - 2)) : null,
          decisionNote: plan.note ?? null,
          overBudget: plan.overBudget === true,
          committedAmount: effectiveCommitted,
        });
        if (effectiveCommitted > 0) bump(committed, plan.category, effectiveCommitted);
      }

      const o = plan.order;
      if (o && !existing.has(o.id)) {
        const orderLines = o.lines ?? plan.lines;
        const orderAmount = lineItemsTotal(orderLines);
        const delivered = o.status === "delivered" || o.status === "paid";
        await tx.insert(procurementOrders).values({
          id: o.id,
          vendor: o.vendor,
          project: PROJECT,
          items: orderLines.length,
          amount: orderAmount,
          eta: isoDay(-o.etaInDays),
          etaDate: isoDay(-o.etaInDays),
          status: o.status,
          purchaseRequestId: plan.id,
          category: plan.category,
          lineItems: orderLines,
          shippedAt: o.status === "ordered" || o.status === "cancelled" ? null : ago(plan.ageDays - 3),
          deliveredAt: delivered ? ago(Math.max(0, plan.ageDays - 8)) : null,
          receivedByUserId: delivered ? site.id : null,
          receivedBy: delivered ? site.name : null,
          deliveryNote: delivered ? "Received complete and in good condition." : null,
          invoiceNumber: o.status === "paid" ? `INV-${o.id}` : null,
          invoiceAmount: o.status === "paid" ? (o.invoiceAmount ?? orderAmount) : null,
          varianceNote: o.status === "paid" ? (o.varianceNote ?? null) : null,
          paidAt: o.status === "paid" ? ago(Math.max(0, plan.ageDays - 10)) : null,
          paidBy: o.status === "paid" ? finance.name : null,
          expenseId: o.status === "paid" ? (o.expenseId ?? null) : null,
          createdBy: finance.name,
          createdByUserId: finance.id,
          createdAt: ago(Math.max(0, plan.ageDays - 3)),
        });
      }

      // The paid order's approved expense (unique on its source).
      if (o?.status === "paid" && o.expenseId && !existing.has(o.expenseId) && !existing.has(o.id)) {
        const paid = o.invoiceAmount ?? lineItemsTotal(o.lines ?? plan.lines);
        await tx
          .insert(expenses)
          .values({
            id: o.expenseId,
            vendor: o.vendor,
            project: PROJECT,
            category: plan.category,
            amount: paid,
            status: "approved",
            submittedAt: ago(Math.max(0, plan.ageDays - 10)),
            sourceType: "purchase-order",
            sourceId: o.id,
            anomalyScore: 0.4,
            anomalyReason: "Invoice differs from the order amount",
          })
          .onConflictDoNothing();
        bump(actual, plan.category, paid);
      }
    }

    for (const c of CLAIMS) {
      if (existing.has(c.id)) continue;
      const who = claimants[c.claimant];
      // Claimants are always staffed on the project, so a claim past "pending-pm" was endorsed by the PM.
      const endorsed = c.status !== "pending-pm" && c.status !== "cancelled";
      await tx.insert(reimbursements).values({
        id: c.id,
        employee: who.name,
        purpose: c.purpose,
        amount: c.amount,
        submittedAt: ago(c.ageDays),
        status: c.status,
        claimantUserId: who.id,
        claimantRole: who.role,
        project: PROJECT,
        category: c.category,
        incurredOn: isoDay(c.ageDays + 1),
        attachments: [{ url: `/uploads/demo/${c.id}.png`, filename: `${c.id}-receipt.png`, contentType: "image/png", sizeBytes: 20_000 }],
        endorsedBy: endorsed ? pm.name : null,
        endorsedAt: endorsed ? ago(Math.max(0, c.ageDays - 1)) : null,
        decidedBy: ["approved", "rejected", "paid"].includes(c.status) ? finance.name : null,
        decidedAt: ["approved", "rejected", "paid"].includes(c.status) ? ago(Math.max(0, c.ageDays - 2)) : null,
        decisionNote: c.note ?? null,
        paidAt: c.status === "paid" ? ago(Math.max(0, c.ageDays - 3)) : null,
        paidBy: c.status === "paid" ? finance.name : null,
        paymentReference: c.status === "paid" ? "DEMO-TRF-0001" : null,
        expenseId: c.status === "paid" ? (c.expenseId ?? null) : null,
      });
      if (c.status === "paid" && c.expenseId && !existing.has(c.expenseId)) {
        await tx
          .insert(expenses)
          .values({
            id: c.expenseId,
            vendor: who.name,
            project: PROJECT,
            category: c.category,
            amount: c.amount,
            status: "approved",
            submittedAt: ago(Math.max(0, c.ageDays - 3)),
            sourceType: "reimbursement",
            sourceId: c.id,
          })
          .onConflictDoNothing();
        bump(actual, c.category, c.amount);
      }
    }

    // Keep each matching budget line consistent with what was just added.
    for (const [kind, map] of [["committed", committed], ["actual", actual]] as const) {
      for (const [k, delta] of map) {
        const category = k.split("|")[1]!;
        const [line] = await tx
          .select({ id: budgets.id })
          .from(budgets)
          .where(and(eq(budgets.project, PROJECT), eq(budgets.category, category)))
          .orderBy(desc(budgets.createdAt))
          .limit(1);
        if (!line) {
          console.log(`  no ${category} budget line on ${PROJECT}: ${delta.toFixed(2)} of ${kind} is not counted against any budget`);
          continue;
        }
        await tx
          .update(budgets)
          .set(kind === "committed" ? { committed: sql`${budgets.committed} + ${delta}` } : { actual: sql`${budgets.actual} + ${delta}` })
          .where(eq(budgets.id, line.id));
      }
    }
    if (actual.size > 0) await refreshMonth(monthKey(new Date()), tx);
  });

  console.log("\nDone. The Finance tabs, the PM Purchasing panel, Requirements and My claims now have data on DEMO-S4.");
}

main()
  .catch((e) => {
    console.error("\n✘ demo-seed-procurement failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
