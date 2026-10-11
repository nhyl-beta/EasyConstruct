# Dashboard, payroll and pagination work — progress

Branch: `staging` only. Four jobs: (A) remove withholding tax from payroll, (B) wider Finance payroll review and a real payslip button, (C) livelier Finance charts, (D) pagination on every list.

## Checklist

- [x] Phase 1 — baseline and inventories
- [x] Phase 2 — Job A: remove withholding tax
- [x] Phase 3 — Job B: wider payroll, payslip button, print
- [x] Phase 4 — Job C: livelier charts
- [ ] Phase 5 — Job D: pagination everywhere
- [ ] Phase 6 — verification

## Baseline (before any change)

| Command | Result |
|---|---|
| client `npx tsc --noEmit` | exit 0 |
| client `npx vitest run` | 6 files, 237 tests passed |
| client `npm run build` | exit 0 (built in 1m 54s) |
| server `npx tsc --noEmit` | exit 0 |
| server `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/baseline_dummy npm test` | **467 tests, 466 passed, 1 failed** (not the 365/365 the brief expected; the suite has grown) |

Pre-existing failure, not touched: `flag off: validate is a 404 and does nothing (FEATURE_AI is not set in tests)` in the AI-validation tests. It fails because `server/.env` sets `FEATURE_AI` and the test assumes it is unset, so it depends on the machine, not on the code.

## Job A inventory — every line matching `withhold|w/tax|taxable|tax|bir|train` (case-insensitive)

`file:line:text` (80 lines, 24 files; the word-boundary search is used for `tax`, `bir`, `train` so "syntax" and "constraint" do not match).

```text
server/src/db/schema/payroll.ts:34:  withholdingTax: numeric("withholding_tax", { precision: 10, scale: 2 })
server/src/payroll/ph-statutory.ts:5: * Pag-IBIG/withholding tax" as a single number. Those are four separate
server/src/payroll/ph-statutory.ts:22: *  - Withholding tax (TRAIN Act RA 10963, revised 2023-onward brackets):
server/src/payroll/ph-statutory.ts:23: *    applied to taxable income, i.e. gross minus the three contributions
server/src/payroll/ph-statutory.ts:24: *    above, which are non-taxable by law.
server/src/payroll/ph-statutory.ts:85:// ── BIR withholding tax ──────────────────────────────────
server/src/payroll/ph-statutory.ts:86:// TRAIN Act monthly table effective 1 January 2023 onward. Each bracket is
server/src/payroll/ph-statutory.ts:103:export const withholdingTax = (monthlyTaxableIncome: number): number => {
server/src/payroll/ph-statutory.ts:104:  if (monthlyTaxableIncome <= MONTHLY_TAX_TABLE[1]!.floor) return 0;
server/src/payroll/ph-statutory.ts:108:    .find((b) => monthlyTaxableIncome > b.floor)!;
server/src/payroll/ph-statutory.ts:109:  return round2(bracket.base + (monthlyTaxableIncome - bracket.floor) * bracket.rate);
server/src/payroll/ph-statutory.ts:116:  withholdingTax: number;
server/src/payroll/ph-statutory.ts:133:    return { sss: 0, philhealth: 0, pagibig: 0, withholdingTax: 0, total: 0 };
server/src/payroll/ph-statutory.ts:143:  // Contributions are excluded from taxable income (NIRC §32(B)(7)(f)).
server/src/payroll/ph-statutory.ts:144:  const monthlyTaxable = Math.max(0, monthlyEquivalent - sss - philhealth - pagibig);
server/src/payroll/ph-statutory.ts:145:  const tax = withholdingTax(monthlyTaxable);
server/src/payroll/ph-statutory.ts:153:    withholdingTax: forPeriod(tax),
server/src/payroll/ph-statutory.ts:159:      perPeriod.sss + perPeriod.philhealth + perPeriod.pagibig + perPeriod.withholdingTax,
server/src/payroll/engine.test.ts:3:import { computeLine, getRules, periodEndDate, sssMsc, withholdingTaxFor } from "./engine.js";
server/src/payroll/engine.test.ts:22:  for (const [gross, sss, ph, pi, tax, net] of cases) {
server/src/payroll/engine.test.ts:28:    assert.equal(l.withholdingTax, tax, `tax @${gross}`);
server/src/payroll/engine.test.ts:63:test("tax edge at taxable income 20,833 / 20,834", () => {
server/src/payroll/engine.test.ts:64:  assert.equal(withholdingTaxFor(20_833, rules), 0);
server/src/payroll/engine.test.ts:65:  assert.equal(withholdingTaxFor(20_834, rules), 0.15);
server/src/payroll/engine.test.ts:102:    assert.equal(l.withholdingTax, legacy.withholdingTax, `tax @${gross}`);
server/src/payroll/engine.ts:13: * reports — it does not remit anything to SSS, PhilHealth, Pag-IBIG or BIR.
server/src/payroll/engine.ts:24:  versions: { sss: string; philhealth: string; pagibig: string; tax: string; overtime: string };
server/src/payroll/engine.ts:75:    tax: "builtin-bir-train-2023",
server/src/payroll/engine.ts:127:export const withholdingTaxFor = (taxable: number, rules: PayrollRules): number => {
server/src/payroll/engine.ts:129:  if (taxable <= table[1]!.floor) return 0;
server/src/payroll/engine.ts:130:  const bracket = [...table].reverse().find((b) => taxable > b.floor)!;
server/src/payroll/engine.ts:131:  return round2(bracket.base + (taxable - bracket.floor) * bracket.rate);
server/src/payroll/engine.ts:148:  withholdingTax: number;
server/src/payroll/engine.ts:177:      withholdingTax: 0,
server/src/payroll/engine.ts:205:  const taxable = Math.max(0, gross - sss - philhealth - pagibig);
server/src/payroll/engine.ts:206:  const withholdingTax = withholdingTaxFor(taxable, rules);
server/src/payroll/engine.ts:208:  const deductions = round2(sss + philhealth + pagibig + withholdingTax);
server/src/payroll/engine.ts:219:    withholdingTax,
server/src/payroll/payroll-rules.test.ts:61:  for (const field of ["gross", "deductions", "net", "sss", "withholdingTax"]) {
server/src/payroll/payroll-rules.test.ts:103:  rateVersions: { sss: "a", philhealth: "b", pagibig: "c", tax: "d" },
server/src/payroll/validation.ts:84:    if (!versions || !versions.sss || !versions.philhealth || !versions.pagibig || !versions.tax) {
server/src/payroll/owner-summary.repository.ts:37:  withholdingTax: number;
server/src/payroll/owner-summary.repository.ts:56:      withholdingTax: total(payroll.withholdingTax, "withholding_tax"),
server/src/payroll/owner-summary.repository.ts:88:      withholdingTax: lines.withholdingTax,
server/src/payroll/owner-summary.repository.ts:107:    withholdingTax: n(r.withholdingTax),
server/src/payroll/owner-summary.service.ts:89:    withholdingTax: number;
server/src/payroll/owner-summary.service.ts:357:      withholdingTax: sum(windowApproved, (r) => r.withholdingTax),
server/src/payroll/owner-summary.test.ts:48:  withholdingTax: 5,
server/src/payroll/owner-summary.test.ts:88:    assert.equal(s.statutory.withholdingTax, 20);
server/src/payroll/service.ts:76:    withholdingTax: c.withholdingTax.toFixed(2),
server/src/payroll/service.ts:98:    withholdingTax: sum((l) => l.withholdingTax),
server/src/payroll/types.ts:55:  "incorrect_withholding_tax",
server/src/scripts/demo-seed-owner-payroll.ts:14:// the employee's stored pay rate, so SSS / PhilHealth / Pag-IBIG / tax / EC
server/src/scripts/demo-seed-owner-payroll.ts:232:      withholdingTax: c.withholdingTax.toFixed(2),
server/src/scripts/ensure-demo-schema.ts:225:    -- computations (SSS, PhilHealth, Pag-IBIG, BIR withholding tax) on
server/src/scripts/ensure-demo-schema.ts:232:      ADD COLUMN IF NOT EXISTS withholding_tax numeric(10, 2) NOT NULL DEFAULT 0;
client/src/features/hr/components/payroll-wizard.tsx:456:                  <TableHead className="text-right">Withholding tax</TableHead>
client/src/features/hr/components/payroll-wizard.tsx:468:                    <TableCell className="text-right tabular-nums">{formatCurrency(l.withholdingTax)}</TableCell>
client/src/features/hr/components/payslip-dialog.tsx:9:  tax: "Withholding tax",
client/src/features/hr/components/payslip-dialog.tsx:58:              <Row label="Withholding tax" value={formatCurrency(line.withholdingTax)} />
client/src/features/hr/payroll-api.ts:23:  withholdingTax: number;
client/src/features/hr/payroll-api.ts:77:  withholdingTax: number;
client/src/features/hr/payroll-api.ts:131:  { value: "incorrect_withholding_tax", label: "Incorrect withholding tax" },
client/src/features/hr/payroll-api.ts:157:  | "withholdingTax" | "deductions" | "net" | "employerSss" | "employerEc"
client/src/features/hr/payroll-api.ts:178:    withholdingTax: num(raw.withholdingTax),
client/src/features/payroll-summary/components/OwnerPayrollSection.tsx:367:                        <dt className="text-muted-foreground">Withholding tax</dt>
client/src/features/payroll-summary/components/OwnerPayrollSection.tsx:368:                        <dd className="tabular-nums">{formatCurrency(summary.statutory.withhold
client/src/features/payroll-summary/repositories/payroll-summary.repository.ts:114:      withholdingTax: num(statutory.withholdingTax),
client/src/features/payroll-summary/types/payroll-summary.types.ts:75:    withholdingTax: number;
client/src/pages/roles/finance/finance-payroll-review.tsx:167:                  ["Employee ID", "Name", "Role", "Hours", "Overtime", "Adjustments", "Gross", "SSS", "PhilH
client/src/pages/roles/finance/finance-payroll-review.tsx:168:                  detail.lines.map((l) => [l.empId, l.name, l.role, l.hours, l.overtime, l.adjustments, l.gr
client/src/pages/roles/finance/finance-payroll-review.tsx:280:                    <Figure label="Withholding tax" value={formatCurrency(t.withholdingTax)} />
client/src/pages/roles/human-resources/hr-payroll.tsx:135:        "SSS", "PhilHealth", "Pag-IBIG", "Withholding Tax", "Deductions", "Net",
client/src/pages/roles/human-resources/hr-payroll.tsx:140:        r.sss, r.philhealth, r.pagibig, r.withholdingTax, r.deductions, r.net,
client/src/pages/roles/human-resources/hr-payroll.tsx:147:  // them; it does not remit anything to SSS, PhilHealth, Pag-IBIG or BIR.
client/src/pages/roles/human-resources/hr-payroll.tsx:355:                <TableHead className="text-right">W/Tax</TableHead>
client/src/pages/roles/human-resources/hr-payroll.tsx:399:                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p
client/src/pages/roles/shared/shared-resources.tsx:232:  { href: "https://www.bir.gov.ph", label: "BIR — withholding tax" },
docs/paper-wording-changes.md:98:| Y1 | Payroll limitations | Do not state that payroll is limited to basic pay. The system computes the SSS, PhilHealth and Pag-IBIG cont
docs/demo-and-ux-progress.md:292:    "withholdingTax":"0.00","deductions":"738.00","net":"6162.00", ...}],
```

Also known, found by reading rather than search: `payroll_batches` (`db/schema/finance.ts`) stores `deductions` and `net_payroll` totals that include tax for already-saved batches; the `payroll.withholding_tax` column is `NOT NULL DEFAULT 0` and is added by `scripts/ensure-demo-schema.ts`, not a drizzle migration.

## Job D inventory (first pass, refined in phase 5)

A scan of every `.tsx` that renders a table body (`<TableBody` / `<tbody`) and has no pagination reference (`DataTablePagination`, `usePagination`, `useServerList`, `*Paged`). 36 files already reference pagination. Candidates (some may inherit paging from a parent, and card lists, feeds and history lists are not covered by this scan):

```text
components/workflows/workflow-submission-panel.tsx
features/finance/components/PmPurchasingPanel.tsx
features/finance/components/ProcurementPanel.tsx
features/finance/components/PurchaseRequestsPanel.tsx
features/finance/components/ReimbursementsPanel.tsx
features/projects/components/ProjectsTable.tsx
features/proposals/components/ProposalsTable.tsx
features/hr/components/payroll-wizard.tsx
features/attendance/components/AttendanceSheetImport.tsx
features/lifecycle/components/CloseoutSummaryCard.tsx
features/revisions/components/RevisionsTable.tsx
pages/roles/architect/architect-projects.tsx
pages/roles/shared/shared-claims.tsx
pages/roles/shared/shared-legacy-import.tsx
pages/roles/shared/shared-requests.tsx
pages/roles/shared/shared-transmittals.tsx
pages/roles/shared/print-pages.tsx            (exempt: print page)
pages/roles/*/*-dashboard.tsx (8 dashboards)  (fixed top-N widgets; checked in phase 5)
```

## Phase 2 — Job A (done)

- Engine, `ph-statutory.ts`, service, types, validation, Owner summary, schema, seeds and `ensure-demo-schema.ts` no longer have the tax. `validateBatchLines` requires `sss`, `philhealth`, `pagibig` and ignores any stored extra key (tested both ways).
- Client: payslip, payroll wizard, HR payroll table and CSV, Finance review figure and CSV, Owner payroll statutory list, the Resources link, "Rates used" lines (only sss / philhealth / pagibig / overtime are shown), the rejection reason (unknown or retired codes read "Other").
- Regression tests: ₱9,600 gross (64 h) gives SSS 475, PhilHealth 250, Pag-IBIG 192, deductions 917, net 8,683, employer 1,402, employer cost 11,002; a ₱250,000 line has deductions equal to the three contributions only.
- Search for `withhold|w/tax|taxable|tax|bir|train` in `client/src`, `server/src` and the two docs: only `server/src/scripts/payroll-remove-legacy-tax.ts` matches.
- **Not run:** `server/src/scripts/payroll-remove-legacy-tax.ts`. No migration, no database change, `withholding_tax` column left in the database (`NOT NULL DEFAULT 0`).
- Other places that store deductions or net: only `payroll` lines and `payroll_batches` totals. `hr/service.ts` and the Finance review repository read those stored values live; cash flow does not use them; `server/src/cache` holds generic response caches that may serve old totals until they expire.

Owner steps before staged totals are consistent: (1) `cd server && npx tsx src/scripts/payroll-remove-legacy-tax.ts` (dry run, prints counts, rolls back), (2) review the before/after counts, (3) `npx tsx src/scripts/payroll-remove-legacy-tax.ts --apply`, (4) delete the script.

## Phase 3 — Job B (done in code, not seen in a browser)

- Finance review: batch list is `minmax(280px,360px)`, details take the rest (`minmax(0,1fr)`), stacked below `lg`. The Gross/Deductions/Net card and the Employer contributions card sit side by side from `xl`. The per-employee table shows SSS, PhilHealth, Pag-IBIG and Deductions columns when the table's own container is at least 672px wide (a container query, so it adapts to the real space), otherwise the previous four.
- Rows-per-page selector: compact variant `w-[76px]` (was 56), full variant `w-[84px]` (was 70), with `aria-label`.
- `PayslipButton` (outline, small, document icon, "Payslip", `aria-label` "View payslip for {name}") is used by both Finance review and HR payroll.
- Payslip dialog footer: Close and Print payslip (`window.print()`). `App.css` has an `@media print` block keyed on `data-print-payslip` that hides everything but the dialog content and its own buttons.
- **Not verified:** layout at laptop width, the selector not clipping, keyboard use, and the print preview. I have no signed-in browser here (see the breadcrumb notes), so none of it was seen. Check in Chrome: open a payslip, press Print payslip, and confirm the preview shows only the payslip.

## Phase 4 — Job C (done in code, not seen in a browser)

New, under `client/src`: `components/charts/{chart-tooltip,donut-chart,animated-bar-chart,cash-flow-chart}.tsx`, `lib/group-top-n.ts` (+ 7 tests), `hooks/use-reduced-motion.ts`, and a `chart-bar-grow` keyframe in `App.css` (off for reduced motion).

- **Budget allocation:** grouped by project, top 6 + "Other" (muted), token colours, centre total that swaps to the hovered or focused item's name, amount and percent, hovered slice grows and the rest dim, legend rows are focusable and show amount and percent, sweep-in on load, empty state "No budget allocated yet".
- **Expense distribution:** every known category (so ₱0 categories show a baseline label), staggered grow-in, hover/focus highlight and dim, value labels on bars, tooltip with amount and share, one-line total and largest-category summary, empty state.
- **Cash flow:** token gradients (`--chart-1`, `--destructive`), draw-in, active dots, dashed crosshair, shared tooltip.
- Fixed the invalid `hsl(var(...))` strokes by using the existing `CHART_AXIS_STYLE` and `CHART_GRID_STYLE`; no raw colours remain in the chart files touched (searched for hex, `hsl(`, `rgb(`, `oklch(`).
- `role="img"` with an `aria-label` that lists the values on each chart; the legend and bar labels carry the same numbers as text.
- Reduced motion: `useReducedMotion` turns off Recharts animation and the hover growth; CSS turns off the bar grow.
- The "Live" badge is unchanged: the dashboard hook does not poll, so I did not add a "live" indicator.
- Same shared tooltip and reduced-motion flag applied to `finance-budget.tsx`, `finance-expenses.tsx` and `PmPortfolioCharts.tsx`. `OwnerPayrollSection.tsx` keeps its own three-line tooltip (it shows labor, gross and net together) and only got the reduced-motion flag. Left as they were: the entry animation and interactive legends on those four (the swap there is not a straight replacement).
- Removed an unused `usePagination` import in `finance-expenses.tsx` that already failed lint.
- **Not verified:** how the charts look and behave in light/dark, with reduced motion, or on hover. Nothing was rendered.
