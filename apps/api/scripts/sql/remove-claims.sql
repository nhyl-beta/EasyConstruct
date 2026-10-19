-- server/scripts/sql/remove-claims.sql
--
-- Clears the data left by the removed reimbursement claims feature.
-- For the OWNER to paste into the Neon SQL Editor, AFTER the code that removed the feature is
-- deployed and AFTER taking a Neon branch or snapshot. Run one block at a time.
--
-- This only DELETES ROWS. Do NOT drop the `reimbursements` table or its sequence: the schema in
-- the code still defines the table (unused), and dropping it would put the schema and the
-- database out of sync. Nothing here alters a table, column or sequence.
--
-- Also good to know:
--   * Audit log lines and notifications may still mention claim ids (RMB-...). That is harmless.
--   * Receipt files uploaded with claims live in Vercel Blob and are NOT deleted by SQL.

-- ── 1. Look first (changes nothing) ─────────────────────────────────────────

-- The claims, with status and the expense a paid claim created.
select id, employee, purpose, amount, status, project, expense_id, submitted_at
from reimbursements
order by submitted_at;

-- Counts by status.
select status, count(*) from reimbursements group by status order by status;

-- Expenses booked from paid claims. Deleting these (Option B) lowers expense totals.
select id, vendor, project, category, amount, status, source_id
from expenses
where source_type = 'reimbursement'
order by id;

-- ── 2. Option A (default): delete the claims, keep every expense ────────────
-- The final select must show 0 before you commit. If it does not, run `rollback;` instead.

begin;
delete from reimbursements;
select count(*) from reimbursements;
commit;

-- ── 3. Option B (optional, COMMENTED OUT): also delete the expenses booked from paid claims ──
-- WARNING: this LOWERS expense totals and the "actual" spent on budgets and cash flow by the
-- amounts of those expenses. Budget `actual` and cash-flow figures are NOT recalculated by this
-- script. Only use it if the owner wants those expenses gone from the ledger.
--
-- begin;
-- delete from reimbursements;
-- delete from expenses where source_type = 'reimbursement';
-- select
--   (select count(*) from reimbursements) as claims_left,
--   (select count(*) from expenses where source_type = 'reimbursement') as claim_expenses_left;
-- commit;   -- both numbers must be 0; otherwise run `rollback;`
