# Purchase requests, procurement and reimbursements

Every peso that is actually spent ends up as **one approved expense, one budget `actual` and one cash-flow month**. This document describes how money gets there, who may do what, and what each step does to the budget.

It is delivered as sub-features of the roles that use it, not as new top-level modules.

## The flow

```
Approved requirement
   |  Engineer or PM: "Request purchase"
   v
Purchase request ──(Engineer raised)──> PM endorses ──> Finance approves ──> Order ──> In transit ──> Delivered on site ──> Finance records payment
   pending-pm                              pending-finance       approved     ordered   in-transit      delivered                 paid
                                         (a PM's own request starts here)                                                      |
                                                                                                                                 v
                                                                                                       ONE approved expense (source: purchase-order)
                                                                                                       budgets.actual += invoice amount
                                                                                                       budgets.committed released
                                                                                                       cash-flow month recomputed

Reimbursement claim ──> PM endorses (project staff only) ──> Finance approves ──> Finance records payment
   pending-pm                pending-finance                    approved             paid
                                                                                      |
                                                                                      v
                                                          ONE approved expense (source: reimbursement), actual + cash flow booked

Manual "Record expense" (Finance): unchanged. A pending expense that Finance approves books actual + cash flow.
```

The expense is created **by the payment**, never earlier. A payment can never create two expenses: `expenses (source_type, source_id)` is unique where `source_id` is set, and the payment is a conditional status change (`delivered -> paid`, `approved -> paid`), so a second or simultaneous attempt is a 409 that changes nothing.

## Statuses

| Record | Statuses |
|---|---|
| Purchase request (`PR-0001`) | `pending-pm`, `pending-finance`, `approved`, `rejected`, `ordered`, `cancelled` |
| Procurement order (`PO-0001`) | `ordered`, `in-transit`, `delivered`, `paid`, `cancelled` |
| Reimbursement claim (`RMB-0001`) | `pending-pm`, `pending-finance`, `approved`, `rejected`, `paid`, `cancelled` |

Ids come from database sequences (`purchase_request_seq`, `procurement_order_seq`, `reimbursement_seq`, `expense_seq`), so two requests can never get the same id. Expenses now use `expense_seq` too (the old random `EXP-` + 4 digits could collide); it starts above the largest existing numeric `EXP-` suffix.

Allowed moves are one table per record in `server/src/finance/purchasing/rules.ts`. Notably: a request cannot be cancelled once it is `ordered`; cancelling its order puts the request back to `approved`; an order can only be paid when it is `delivered`.

## Who can do what

The server enforces every row (`requireRole(...)` per route plus checks in the service). The client only hides what the server would refuse.

| Action | Roles | Notes |
|---|---|---|
| Raise a purchase request | Engineer (staffed on the project), Project Manager (the project's own PM), Admin | From an **Approved** requirement on the same project. The amount is computed from the line items. One open request per requirement. |
| Edit a request | The requester | Only while `pending-pm`. |
| Endorse a request | That project's PM, Admin | Not the requester. An Engineer's request starts here; a PM's or Admin's goes straight to Finance. |
| Reject a request | The PM (while it waits for them), Finance / Admin (while it waits for Finance) | A reason is required. |
| Approve a request | Finance Manager, Admin | Not the requester. Over budget needs a decision note. |
| Cancel a request | The requester, that PM, Finance / Admin | Not once ordered. Releases any commitment. |
| Create an order | Finance Manager, Admin | From an `approved` request. One order per request. |
| Mark in transit | Finance Manager, Admin | |
| Confirm delivery | Engineer or Site Personnel staffed on the project, that project's PM, Admin | **Never the person who created the order.** |
| Record payment | Finance Manager, Admin | Needs `delivered`. |
| Cancel an order | Finance Manager, Admin | Before delivery. |
| File a claim | Engineer, Site Personnel, Project Manager, Architect, Human Resources | At least one receipt. Project staff on a project that has a PM go to that PM first; everyone else goes to Finance. |
| Endorse a claim | That project's PM, Admin | Not the claimant. |
| Approve / pay a claim | Finance Manager, Admin | **Never your own claim.** |
| Cancel a claim | The claimant | Only while pending. |
| See requests and orders | Finance / Admin: all. PM: their projects. Engineer / Site Personnel: staffed projects, read-only. The requester: their own. | |
| See a claim | The claimant, Finance / Admin, and the PM of the claim's project | |

Owner, IT Designer and Consultant have nothing here in this build.

### Segregation of duties (server-enforced, 403 / 409)

- Nobody endorses, decides or pays their own request or claim.
- The person who confirms a delivery cannot be the one who created that order.
- Finance does not submit claims (it is not a claimant role), so Finance can never decide a claim it filed.

## What each step does to the budget

A budget line is matched by **project code + category** (the same match the expense approval uses). `remaining = planned − committed − actual`.

| Step | `committed` | `actual` | Cash flow |
|---|---|---|---|
| Request approved | `+ amount` (the request's amount) | – | – |
| Order created for less than the request | `− (request − order)`; the request now holds only the order amount | – | – |
| Order cancelled | request returns to `approved` and holds its **full** amount again | – | – |
| Request cancelled while `approved` | `− held amount` | – | – |
| **Payment recorded** | `− held amount` (floored at 0) | `+ invoice amount` | that month's outflow recomputed |
| Claim paid | – | `+ claim amount` | that month's outflow recomputed |
| Manual expense approved | – | `+ amount` | that month's outflow recomputed |

The booking is one function, `applyApprovedSpend` (`finance/purchasing/booking.ts`), used by expense approval, order payment and claim payment. `committed` changes use atomic SQL (`GREATEST(0, committed + delta)`), not read-modify-write. A payment runs in **one transaction**: status change, expense, `actual`, `committed` release and the cash-flow refresh all commit together or not at all.

### Over budget is warned, not blocked

At Finance approval, if there is **no matching budget line** or the amount is more than `remaining`, a decision note is required, the request is flagged `overBudget`, and the response carries a warning. The request detail shows the matching line (planned, committed, actual, remaining) before Finance decides.

### Order and payment rules

- An order can be for **less** than its request (the difference returns to the budget), never more. If more is needed, raise a new request.
- Payment needs a delivered order. The paid amount is the **invoice** amount. If it differs from the order amount a variance note is required, the difference is shown as a variance, and the resulting expense is annotated for review.
- A claim that matches an earlier live claim (same claimant, amount and date incurred) is annotated on its expense as a possible duplicate.

## The closing gate

Closeout (Construction) and Turnover (Design) each get one gate: **"No unsettled procurement or reimbursement"** (`X6` for Construction, `T5` for Design). It is unsettled while any:

- purchase request is `pending-pm`, `pending-finance` or `approved` (not yet ordered);
- order is not `paid` or `cancelled`;
- claim is `pending-pm`, `pending-finance` or `approved` (not yet paid).

Owners of the gate: Project Manager, Admin, Finance. A request that has been ordered is covered by its order, so it is not counted twice.

## Expense categories

There is **one list** of expense categories, kept in the `expense_categories` table and maintained by Finance (**Manage categories** on Budget Management and Expense Management). Budgets, manual expenses, purchase requests, reimbursement claims and the Budget Management / Expense Management filters all read it; nothing is fixed in code.

How a budget line is matched is unchanged: **project + category, by string equality, newest line first.** An approved expense, a committed request or a paid order or claim lands on the budget line whose category text equals its own. Spend only books against a line when both carry the same category, which is why both now come from the one list.

- **Seed.** `Materials, Labor, Equipment, Subcontractors, Permits, PPE, Transport, Services, Contingency, Other`. `Materials`, `Labor` and `Equipment` are *system* categories: they cannot be retired or renamed (approved payroll books against `Labor`). Confirm the list with the company before real use.
- **Retire, do not delete.** A retired category keeps working on existing records and budget lines and stays visible on them, but it is hidden from every new-entry dropdown and refused by the server on new entries. It can be restored.
- **Rename only when unused.** A category that appears in any budget line, expense, purchase request, claim, order or allocation cannot be renamed (the server answers 409 with the counts). Retire it and add a new one instead. Unused, non-system categories can be renamed freely.
- **Writes are checked against the live list.** Creating an expense, budget line, purchase request or claim (and changing the category on an update) needs an *active* category, matched case-insensitively and stored in the list's casing (`materials` is saved as `Materials`). Unknown or retired is a 400 "Unknown or retired category". An update that leaves the category alone is always allowed. The category columns stay plain text; there are no foreign keys, so existing rows are never rewritten.
- **Who.** Reading the list: Finance, Admin, Project Manager, Engineer, Site Personnel, Architect, Human Resources. Adding, renaming, retiring, restoring: Finance Manager and Admin on the server; the screen is Finance only.
- **Not covered.** Workflow budget-change line items keep their own fixed set (`materials, labor, equipment, subcontractor, other`) and are not part of this list.
- **Code.** `server/src/finance/categories/` (rules, repository, service, routes); `resolveActiveCategory` is the helper the other modules call. Migration `server/drizzle/0026_expense_categories.sql` is additive (one table and an idempotent seed).

## Where it lives

| Role | Place |
|---|---|
| Finance Manager | Expense Management: Purchase Requests, Procurement and Reimbursements tabs (`?tab=` opens one). Tracking shows a Source column (Manual, `PO-…`, `RMB-…`). |
| Engineer | Requirements page: purchase status chip, **Request purchase** on Approved requirements, **Confirm delivery**. My claims. |
| Site Personnel | Requirements page: purchase status chip, **Confirm delivery** (cannot raise requests). My claims. |
| Project Manager | Approvals page: Purchasing panel (**To endorse**, **Raise a request**, **Status**). My claims. |
| Architect, Human Resources | My claims. |

The Finance Approvals queue (dashboard) lists purchase requests and claims that wait on Finance.

## Data

- Additive migration `server/drizzle/0025_purchasing.sql`: new columns on `purchase_requests`, `procurement_orders`, `reimbursements` and `expenses`, four sequences, one partial unique index. No table is created, dropped or re-typed.
- Demo data: `npm run demo:seed-procurement` (insert-only, idempotent, demo databases only). It is also the last step of `demo:seed-roles`.
