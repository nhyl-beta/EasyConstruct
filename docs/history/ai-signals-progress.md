# AI-Validation decision-support layer — progress

Branch: `dev-ai` (created as `feature/ai-signals` off `feature/project-lifecycle` @ `2946adc`; renamed to `dev-ai` outside this work, now tracks `origin/dev-ai` — same commit history, name only).

At the start of every session: read this file and continue from the first unticked item.

## Checklist

### A. Preflight

- [x] **A1** Branch created (`feature/ai-signals` off `feature/project-lifecycle`). Baseline recorded before any change:
  - `npx tsc --noEmit -p server` — clean, 0 errors.
  - `npm --prefix server test` — 22/22 pass (all from the lifecycle work: `gates.test.ts`, `progress.test.ts`).
  - `/api/finance` mount confirmed at `server/src/app.ts:103`: `app.use("/api/finance", authenticate, financeRouter);` — already fixed by the lifecycle work's own A1, nothing to do here.
  - Commit: `568a4ec` (see below).
- [x] **A2** Verified EstimationPro.ai live, 2026-09-24-25. Both endpoints answer with **200** and a shape close to, but not identical to, the spec (see Deviations §AV-1):
  - `GET /api/v1/trades` → `{ data: { trades: [{trade, itemCount}, ...], totalItems }, meta: { source: "EstimationPro.ai Construction Cost API", url, methodology, updated, license } }`. 34 trades, 411 total items.
  - `GET /api/v1/costs?trade=concrete` → `{ data: { trade, location: "National average", multiplier: 1, itemCount, items: [{id, description, unit, low, high, typical, volatility, lastVerified, regionallyAdjusted}, ...] }, meta: {...} }`.
  - `location=Manila` query param is accepted but ignored — no PH-specific data, always returns `"National average"`, `multiplier: 1`. Fine: `region_multiplier` is nullable/defaults to 1 in the schema anyway.
  - `GET /api/v1/index` also answers (200), confirming the higher 500/day quota endpoint exists, though nothing in this build uses it yet.
  - **Not a stop condition** — proceeding to Group B on this shape.
  - Commit: `568a4ec`.
- [x] **A3** Split `FEATURES.ai` (client) into `ai` (real output) and `aiPlaceholders` (hardcoded `false`, never wired to an env var). Full surface audit and moves below. Verified: `npm --prefix client run build` succeeds (exit 0) after every move; `npx tsc --noEmit -p server` stays clean.
  - Commit: `568a4ec`.
- [x] **A4** `server/src/config/signals.ts` created with `SIGNAL_THRESHOLDS` (S-4), `SIMILARITY_FLOOR = 0.40`, `REFERENCE_CACHE_TTL_MS` (7 days), `DAILY_REQUEST_BUDGET = 80`. `server/src/config/env.ts` gained `FX_RATE_USD_PHP` (default 62.73) and `FX_RATE_AS_OF` (default "2026-09-22").
  - Commit: `568a4ec`.

**A3 surface table** (audited via a full grep of `client/src` for `FEATURES.ai`, both client and server sides):

| Surface | File | Real or placeholder | Flag now |
|---|---|---|---|
| Proposal completeness validation panel | `features/proposals/components/ProposalsRegister.tsx:129` | **Real** — renders `proposals.aiValidation`, computed by `proposals/validation.ts` (deterministic checks: title length, project existence, description length) | `ai` |
| Proposal validation table column | `pages/roles/architect/architect-proposals.tsx` (5 sites) | **Real** — same `aiValidation` data | `ai` |
| Proposal validation summary panel | `pages/roles/consultant/consultant-proposals.tsx:547` | **Real** — same data, labeled "Rule-Based Validation Summary" | `ai` |
| Header "AI · {primaryAi}" badge | `components/refine-ui/layout/header.tsx:136` | Placeholder — `primaryAi` is a static per-role string in `config/role-tab.ts`, computes nothing | `aiPlaceholders` |
| Multi-step "Generate with AI" hint | `components/ui/multi-step-page.tsx:112` | Placeholder — static hint text, no backend call | `aiPlaceholders` |
| Consultant dashboard "AI validation insights" card | `pages/roles/consultant/consultant-dashboard.tsx:225` | Placeholder — `ComingSoonCard`, explicitly "not wired to a backend yet" | `aiPlaceholders` |
| PM dashboard "AI insights" card | `pages/roles/project-manager/pm-dashboard.tsx:193` | Placeholder — `ComingSoonCard` (real `WaitingOnYouCard` already sits above it, from lifecycle group K1) | `aiPlaceholders` |
| PM workflows "AI suggestions" tab | `pages/roles/project-manager/pm-workflows.tsx:79,219` | Placeholder — card literally titled "Not yet connected" | `aiPlaceholders` |
| HR "AI HR assistant" card | `pages/roles/human-resources/hr-dashboard.tsx:428` (renders `AIInsightsCard`, defined 237-287) | Placeholder, **highest-risk of the batch** — showed a "Live" badge over `hrAIInsights`, a hardcoded array in `providers/mock-data.ts`; nothing ever computed it | `aiPlaceholders` |
| Finance expenses "AI" column + anomaly card | `pages/roles/finance/finance-expenses.tsx` (4 sites) | Placeholder — keyed off `expense.anomalyScore`, which **nothing in the codebase ever assigns a value to** (grepped client + server, zero writers) | `aiPlaceholders` |
| `useFinanceAiInsightsController` hook | `features/finance/hooks/use-finance-ai-insight.ts` | Placeholder/dead-end — `/api/finance/ai-insights` and `/api/finance/risks` are commented out server-side (`server/src/routes/finance.ts`); the hook never fetches anything regardless of the flag | `aiPlaceholders` |
| `/ai-insights` route | `App.tsx:162` | Placeholder — unconditionally redirects to `/dashboard` (this is correct now that `aiPlaceholders` is permanently false: a dead route should always bounce, not conditionally) | n/a (route itself un-gated by design; see below) |
| "AI Insights" nav entry | `providers/resources.ts` | Was un-gated (would show a nav link into a redirect-to-dashboard route). Now filtered out of the exported `resources` array unless `aiPlaceholders` is on | `aiPlaceholders` |
| `pm-ai-insights.tsx`, `shared-ai-insights.tsx` pages | `pages/roles/*/*-ai-insights.tsx` | Placeholder (`ComingSoonCard`), unreachable now that the route redirects and the nav entry is gone. Left in place, not deleted. | n/a — unreachable |
| `workflows.aiNote` | server `workflows/service.ts`, always written; UI shows it when `FEATURES.ai` on (client) | **Real** — this is the field the decision-support cost-comparison service (Group C) will start writing real citations into | `ai` |

Server-side `FEATURES.ai` sites (both real, unchanged): `proposals/service.ts` `create()` and `submit()`, computing `aiValidation` via `validateProposal()`.

### B. Reference data

- [x] **B1** `reference_snapshots` and `validation_results` tables added to `server/src/db/schema/ai-validation.ts` plus matching idempotent SQL in `ensure-demo-schema.ts`. `reference_snapshots` unique on `(source, source_item_id)` for upserting. Verified: ran `ensure-demo-schema.ts` live, queried `information_schema.columns` for both tables — all columns present.
- [x] **B2** `workflow_line_items` gained nullable `quantity`/`unit`, mirrored in the Drizzle schema, `ensure-demo-schema.ts`, `validators/workflow-validators.ts` (`workflowLineItemSchema`), `workflows/types.ts` (`WorkflowLineItemInput`/`WorkflowLineItemRecord`), and threaded through `workflows/service.ts`'s `insertLineItems` call. Verified: `information_schema.columns` shows both new columns on `workflow_line_items`.
- [x] **B3** `server/src/ai-validation/reference-client.ts`: `fetchTrades()`/`fetchCostsForTrade(trade)`, 5s `AbortController` timeout, in-memory daily counter capped at `DAILY_REQUEST_BUDGET` (80), upsert via `onConflictDoUpdate`, never throws (catches and logs, returns `[]`/empty array on any failure). Verified live (see B5).
- [x] **B4** `server/src/ai-validation/cache.ts`: `getReferenceItems()` reads cached rows, triggers exactly one lazy refresh (deduplicated via a shared in-flight promise) when empty or the newest `fetchedAt` is older than the 7-day TTL, falls back to stale rows if the refresh yields nothing.
- [x] **B5** `server/src/scripts/seed-reference-data.ts` + `npm run ai:seed-references`. **Run live end-to-end**: pulled all 34 trades, 411 items, zero failures on the second run. Verified via direct SQL: `SELECT count(*) FROM reference_snapshots` → 411; spot-checked `concrete` trade's 13 rows for correct `low_usd`/`typical_usd`/`high_usd`/`region_multiplier` (`1.000`, matching the API's `multiplier: 1`) and description length.
  - **Real bug found and fixed while running this live**: some EstimationPro.ai item descriptions run past 500 characters (e.g. the `addition` trade's `master-suite-addition-per-sqft`/`bathroom-addition-per-sqft` items), overflowing the original `varchar(255)` `reference_snapshots.description` column with a Postgres `22001` error. Fixed by widening the column to `text` in both the Drizzle schema and `ensure-demo-schema.ts` (with an `ALTER COLUMN ... TYPE text` for the table already created once with the narrower type) — logged as AV-4.
  - Commit: `77a8bf7`.

### C. Cost comparison

- [x] **C1** `server/src/ai-validation/units.ts`: `normalizeUnit`/`convertQuantity`, alias table, exact factors only. Tests: `units.test.ts`, 15 cases (every alias family, every conversion factor, reversibility, cross-family and unrecognized-unit rejection). **Real bug caught by the tests**: the alias for "ln ft"/"linear ft" was keyed wrong (`linft` instead of the actual cleaned key `lnft`/`linearft`) — fixed, and cross-checked against every unit string actually present in the seeded catalog (see below).
- [x] **C2** `server/src/ai-validation/matcher.ts`: `tokenize`/`dice`/`bestMatch`, deterministic lower-id tie-break. Tests: `matcher.test.ts`, 11 cases (tokenization incl. numeric-prefixed tokens like "12mm", Dice arithmetic, the 0.40 floor with a nonsense "asdf 123" input, tie-break determinism).
- [x] **C3** `server/src/ai-validation/cost.ts`: `compareLineItem`. Tests: `cost.test.ts`, 9 cases, including the Field Guide's worked trace (typical $12,850 → mid ₱806,081 (well, ₱806,080.50 stored, ₱806,081 displayed) → **+5.4%** variance → `within-range` — numbers match the guide's example exactly) plus above/below-typical and all four no-match reasons (no quantity, no unit, no match, unconvertible units) with the "no range shown" honesty rule asserted directly.
- [x] **C4** `server/src/ai-validation/service.ts`: `validateWorkflowLineItems(workflowId)` — persists a `validation_results` row per line (including no-match), writes a ≤500-char summary to `workflows.aiNote`, whole body in try/catch. Verified live (see below).
- [x] **C5** Wired into `workflows/service.ts createWorkflow`, after `insertLineItems`, gated by `FEATURES.ai && template.name in {"Budget Change Request","Change Order Request"}`. Awaited but caught, never fails workflow creation.
- [x] **C6** `initiate-workflow-dialog.tsx`: added Quantity + Unit (select, from `units.ts`'s exact-conversion set) to each line-item row; helper text "Add quantity and unit to compare against market cost." shown only when `FEATURES.ai` is on; fields themselves always shown (plain data, not AI-gated).
- [x] **C7** `attachStages` attaches each line item's latest `validation_results` row (via new `ai-validation/repository.ts findLatestByLineItemIds`) when `FEATURES.ai` is on; new `ai-validation/types.ts LineItemValidationSummary`; client `workflow.types.ts` updated to match (`WorkflowLineItem.validation`).
- [x] **C8** 🟡 `POST /api/workflows/:id/revalidate` (finance-manager, admin) + a "Re-check market cost" button on Finance Impact Review (`finance-impact-review.tsx`), flag-gated, reloads the list on success, swallows failure silently (decision support, not worth a page-level error banner).
  - Commit: `77a8bf7`.

**Live verification (checkpoint 2 evidence)**: ran the dev server with `FEATURE_AI=true`, logged in as the demo engineer, temporarily flipped `DEMO-01` to Construction, and created a real "Budget Change Request" workflow with three line items — one matchable (128.5 lf of "Rebar installation, #4 bar" against the seeded catalog's "Rebar #4 (1/2 inch)"), one with the same match but a wildly inflated amount, and one with no quantity at all. Actual server response:
  - Matched line → `verdict: "above-typical"`, `basisSummary: "Matched 'Rebar #4 (1/2 inch)' (score 0.44) · EstimationPro.ai, fetched 2026-09-24 · ₱62.73/$1 as of 2026-09-22 · reference ₱3,224–₱8,061 (typical ₱5,240) · submitted ₱850,000 · +16122.9%."` — real citation, real numbers, correctly flagged as far above typical (the test amount was deliberately unrealistic to force the branch).
  - No-quantity line → `verdict: "no-match"`, `basisSummary: "No comparable reference — line has no quantity."`, no range shown.
  - `workflows.aiNote` on the created workflow: `"2 of 3 line(s) compared to EstimationPro.ai: 2 above typical (+95328.6%); 1 no-match (line has no quantity)."`
  - Test workflow and its validation_results rows deleted afterward (cascade), `DEMO-01` restored to `Archived`, dev server stopped.

### D. Signal layer

- [x] **D1** `server/src/signals/types.ts`: `Signal`, `SignalSource`, `SignalContext`, `SignalRule` per spec 4.1 — `Signal` deliberately mirrors `GateCheck` minus `passed`.
- [x] **D2** `lifecycle/repository.ts loadSnapshot` gained `validationResults` (this project's rows from `validation_results`, scoped by the column that's already there) and `issuePrecedents` (up to 3 most-recent `Resolved` issues with non-empty `resolutionNotes`, per open category, from **any** project — only `issueCode`/`title`/`category`/`resolutionNotes`/`updatedAt` selected, never another project's commercial data). Both fields added to `emptySnapshot()` in `gates.test.ts` and `progress.test.ts`.
- [x] **D3** `signals/cost-variance.ts` — reads `validationResults` already on the snapshot (no DB/network access of its own); fires only for `above-typical`/`below-typical` verdicts on workflows that are `active` or finished within 30 days; `within-range`/`no-match` raise nothing (they only show on the line-item badge, per S-7/E4).
- [x] **D4** `signals/cumulative-change-impact.ts`.
- [x] **D5** `signals/burn-vs-progress.ts` — deliberately uses task completion (`s.tasks`), not `projects.progress`, as the completion side, since progress includes the Construction band's 30% offset.
- [x] **D6** `signals/issue-recurrence.ts` — recurrence (warn/critical) and precedent (info) in one rule file, since they share the same per-category grouping; never restates K3 (adds *specific category* + *duration/precedent*, not just "issues exist").
- [x] **D7** `signals/stalled-stage.ts` — adds *duration* on top of K4's "workflow exists"; a `revision-required` stage is attributed to the workflow's own stage-1 role (the initiator who must fix it), not the reviewer who sent it back.
- [x] **D8** `signals/index.ts`: `runSignals` (pure, testable, per-rule `try/catch` so one broken rule doesn't silence the others, sorts critical→warn→info) and `evaluateSignals` (flag-gated, `[]` when `FEATURES.ai` is off).
- [x] **D9** `signals/signals.test.ts` — 26 tests: every rule's warn/critical thresholds and silence conditions, the Field Guide's exact numbers (₱5.32M/₱4.50M → +18.2% warn; 68%/40% → 28-point warn), phase filtering (a Proposal-phase project gets no burn signal), a quiet project yielding `[]`, rule isolation (a throwing rule loses only itself), severity sorting, every signal's `detail` containing a digit, and the flag returning `[]` when off. **All 84 passed on the first run** — no bugs found in this group (unlike B/C, where live seeding and unit tests each caught a real bug).
- [x] **D10** `lifecycle/boundary.test.ts` — reads the actual source of `gates.ts` (asserts zero imports from `../signals`/`../ai-validation`) and `service.ts` (asserts at most one such import, and only `evaluateSignals` from `../signals/index.js`). Written now, before Group E adds that one import, so it locks in the boundary from the start rather than retrofitting it.
  - Commit: `09f012b`.

### E. Surfaces

- [x] **E1** `LifecycleView.signals` added in `getLifecycleView` — present only when `FEATURES.ai` is on (the key is entirely omitted otherwise, not an empty array). Verified with curl against a live dev server: `FEATURE_AI` unset → `'signals' in data` is `false`; `FEATURE_AI=true` → `true`, `[]` for a quiet project.
- [x] **E2** `DecisionSupportSection.tsx` renders beneath the gate checklist in `ProjectLifecyclePanel`, its own card (border/background, "AI" badge, "Rule-based advisories — they never block approval." subtitle per S-8), severity chip + label + detail + citation + "Go to" link per signal, "No advisories for this phase." when empty. Nothing in it can call advance/decide.
- [x] **E3** `my-actions.ts` adds `kind: "signal"` items (warn/critical only — info stays on the project's own Decision Support section) filtered to the actor's `ownerRoles`, flag-gated. `WaitingOnYouCard` renders them with a `Sparkles` icon and an "AI" badge, visually distinct from gate (⚠) and workflow items.
- [x] **E4** `ReferenceBasisBadge` (verdict + variance, full `basisSummary` in a popover) added to `WorkflowLineItemsTable` (`workflow-submission-panel.tsx`), flag-gated column.
- [x] **E5** Engineer issues screen: an open issue whose category has a resolved precedent shows "Resolved before" with up to 2 precedent notes. **Chose the small dedicated endpoint** (`GET /api/issues/precedents/:category`, gated by `FEATURES.ai` in `issues/service.ts`) over reusing the lifecycle view's signals — the issues screen lists issues across every project the engineer can see, so filtering lifecycle-view signals would mean one `/lifecycle` call per distinct project represented, while a category-keyed endpoint is one call per open category regardless of how many projects those issues span. Less code, said here per the checklist's instruction.
- [x] **E6** 🟢 `POST /api/ai-validation/refresh-references` + `GET /api/ai-validation/references-status` (admin only), a `RefreshReferencesCard` on the admin dashboard showing cached-item count and last-refresh time with a manual refresh button.
  - Commit: `c75b9d9`.

**Live verification (checkpoint 4 evidence, all against a real running dev server with `FEATURE_AI=true`, cleaned up after):**
- **E1**: curl-confirmed the `signals` key's presence/absence both ways (above).
- **E2**: flipped `DEMO-01` to Construction, loaded `/projects/DEMO-01` as PM — saw "No advisories for this phase." Then bumped one budget's `planned` to ₱5.5M against a ₱4.5M contract value and reloaded: real signal rendered — *"Approved changes total +22.2% over contract value"*, detail *"Budget planned ₱5,500,000 against a contract value of ₱4,500,000 — a difference of ₱1,000,000."*, **Critical** chip, "Go to budget" link — while the K1-K4 gate checks above it and `canAdvance` were completely unaffected.
- **E3**: same scenario, PM's dashboard "Waiting on you" card showed the identical signal with an "AI" badge, alongside (not replacing) gate/workflow items.
- **E4**: created a real Budget Change Request (`WF-1021`) with a matchable line ("Concrete slab, poured and finished", 100 sqft) and a no-quantity line. Finance Impact Review rendered *"Above typical (+32.8%)"* and *"No comparable reference"* badges respectively, plus the C8 "Re-check market cost" button.
- **E5**: created a real open Safety issue on `DEMO-01`; the engineer issues screen showed *"Resolved before"* citing the actual resolved "TEST-ISSUE" precedent and its note.
- **E6**: admin dashboard's "Cost reference catalog" card correctly read *"411 cached items · last refreshed 14h ago"* — the real count from the Group B seed.
- All test data (workflow, issue, budget bump, phase flips) was cleaned up / reverted afterward; both `.env` files restored to flag-off.

### F. Verification

- [x] **F1** Flag off, nothing changes.
  - `npm --prefix server test` — 84/84 pass.
  - `npx tsx src/scripts/demo-full-cycle.ts` against a live flag-off server: ran clean end to end, **identical phase/% table** to the lifecycle work's own baseline (4/10/25/30/95/100/100).
  - `npx tsx src/scripts/api-smoke-test.ts`: 5/11 assertions failed, but every failure was `Project 2 / TEST_v22 not found` — that scratch project no longer exists in the database (deleted outside this work; confirmed the projects table only has 3 rows, none numbered 2 or coded `TEST_v22`). Not a regression from this work: none of the ai-signals changes touch that project, and the 401-only assertions (which don't depend on it) all still passed.
  - Browser check (flag off): admin dashboard, HR dashboard, a project detail page, and Finance Impact Review's expanded line-item table — no "AI" badge, no "Decision support" section, no "Market cost" column, no header AI badge. `GET .../lifecycle` confirmed to omit `signals` via curl.
- [x] **F2** `server/src/scripts/demo-ai-signals.ts` (`npm run demo:ai-signals`) — drives a fresh project to Construction, then deliberately trips all five rules: a Budget Change Request with a within-range line, a wildly above-typical line (+165%), and a no-quantity line; a second approved budget line pushing planned to 15% over contract; 1-of-4 tasks completed against a large approved expense (burn far ahead of completion); 3 Material issues (one resolved with a note); the Budget Change Request's current stage backdated 50 hours via direct SQL. **All 7 assertions passed on the first run**: all five rules fired at their expected severity (cost-variance critical, the other four warn, issue-recurrence citing its precedent), and — the core guarantee — the live API's `checks`/`canAdvance` were asserted **byte-for-byte identical** to an independent, direct call to `evaluateGate`/the canAdvance formula (bypassing the HTTP layer and `FEATURES.ai` entirely). Scenario project `AISIG-MUGLM73Z` (id 12) deliberately left in the database as a permanent artifact, per the same convention `demo-full-cycle.ts`'s output project used.
- [x] **F3** Field Guide's "how you'll know it works" checklist:

  | Item | Verified by |
  |---|---|
  | Flag off leaves no AI wording and the lifecycle demo still runs | F1: browser sweep + identical `demo-full-cycle.ts` phase table |
  | Flag on shows a separate advisory section | E2 live check: "Decision support" card, visually separate, own heading/divider |
  | A Proposal-phase project gets no burn signal | D9 unit test (`burn-vs-progress.test`: "a Proposal-phase project yields no burn signal") |
  | A quiet project gets no signals | D9 unit test + E2 live check ("No advisories for this phase.") |
  | Every signal states its numbers | D9's "every emitted signal has a non-empty detail containing a digit" test, plus every live E2-E5 signal shown above has real numbers in its detail |
  | "asdf 123" gives no-match with no range | C2's `matcher.test.ts` ("nonsense input returns null (below the 0.40 floor)") and C3's `cost.test.ts` no-match cases assert no `₱` appears |
  | Approving a budget change moves the cumulative signal | F2, live: approving a second budget line pushed `cumulative-change-impact` from absent to firing at warn |
  | One broken rule doesn't silence the others | D9 unit test ("a throwing rule loses only itself") |
  | Every rule has a test | `signals.test.ts` has a dedicated `describe` block per rule (5) plus cross-cutting tests |
  | The flag changes what is shown, never what can be approved | F2's strongest evidence: the live server's `checks`/`canAdvance` (flag on, mid-anomaly) matched a direct, independent call to the pure gate functions exactly — not just "looked the same," provably the same computation |

  - Commit: `ef0bbc6`.

## Deviations

- **AV-1 (A2):** EstimationPro.ai's actual response shape differs in two small, non-blocking ways from the prompt's assumed shape: (1) `multiplier` and `regionallyAdjusted`/`location` are fields on the **trade-level response**, not per catalog item — every item in one `/costs?trade=X` call shares the same multiplier, so `reference_snapshots.region_multiplier` is populated once per fetched batch, not computed per item; (2) items carry two extra fields not in the original spec (`lastVerified`, `regionallyAdjusted`) — harmless, will be preserved in `raw_payload` (jsonb) but not given dedicated columns. Neither difference blocks Group B; not stopping at checkpoint 1 over this.
- **AV-2 (A3):** the HR "AI HR assistant" card was the one placeholder surface that visually implied real, live output (a "Live" badge over static mock data) rather than reading as an obvious stub like the others ("Coming soon", "Not yet connected"). Moved to `aiPlaceholders` like the rest rather than deleting it, per the "hide, don't delete" rule — flagged here since it's the one a reviewer is most likely to have believed was real.
- **AV-3 (A3):** `providers/resources.ts`'s `resources` export changed from a plain array literal to a filtered one (`allResources` + a conditional `.filter`), the minimal change to stop the nav from linking to a route that only redirects away. No other resource entries were touched.
- **AV-4 (B1/B5):** `reference_snapshots.description` was originally `varchar(255)` per the spec's implied shape; live data broke that (some EstimationPro.ai descriptions exceed 500 characters). Changed to `text`, no length cap — these are read-only cached catalog values, not free-form user input needing a bound.
- **AV-5 (C8):** implemented the 🟡 should-have C8 (revalidate endpoint + button) during Group C rather than deferring it, since the service it calls (`validateWorkflowLineItems`) already existed from C4 and the marginal cost was small — noted here since the checklist's own priority marking suggested it was optional.
- **AV-6 (E5):** chose the small dedicated `/issues/precedents/:category` endpoint over reusing the lifecycle view's signals, for the reason given in the E5 checklist note above (fewer calls given the issues screen spans multiple projects).
- **AV-7 (E6):** implemented the 🟢 nice-to-have E6 as well, since it was a thin wrapper over `reference-client.ts` (already built) and useful for the live verification itself (confirmed the seeded 411-item count from the actual admin UI).
- **AV-8 (process):** the spec's checkpoints are after Groups A, C, D, and F only — Groups B and E don't have a dedicated stop. The Group E completion message in this session was mislabeled "Checkpoint 4"; it should have simply continued into Group F without pausing. No work was lost or skipped — noted here purely as a labeling correction, since the real Checkpoint 4 (final) is this one, after Group F.
- **AV-9 (F1):** `api-smoke-test.ts`'s failures (5 of 11 assertions) are caused entirely by its hardcoded scratch project (`TEST_v22`, id 2) having been deleted from the database at some point outside this work — confirmed via `SELECT * FROM projects`, which shows only 3 unrelated rows. This is environment drift, not a regression: none of the ai-signals changes touch that project or that script's code paths, and the assertions that don't depend on it (both 401 checks) still passed. Recreating that scratch project was judged out of scope for this task.

## Queued UI/UX fixes (user-reported, out of scope for AI-signals — picked up after Checkpoint 4)

Reported by the user 2026-09-25. All six done and live-verified against a running dev server.

- [x] **Q1** Notification bell (`notification-bell.tsx`): added client-side pagination (8/page, Prev/Next, "Page X of Y"), reset on open. **Real bug found while verifying**: the new Prev/Next `<Button>`s had no `type="button"`, so they defaulted to `type="submit"` and triggered an ambient form navigation to `/workflows` on every click — fixed. Verified live: paged a real 17-notification inbox through all 3 pages with no stray navigation.
- [x] **Q2** Consultant proposal review (`consultant-proposals.tsx`): the Approve/Reject/Request-revision buttons stayed clickable with an empty comment, so a Consultant could click Approve, confirm, and only *then* see "comment required" — reading as "nothing happens when I click approve." Fixed: buttons disabled until the comment is non-empty, with a `*` on the label, updated helper text, and a tooltip. Verified live with a real submitted proposal.
- [x] **Q3** Map z-index leak (`location-map-picker.tsx`): Leaflet's own CSS sets z-index up to 1000 on its zoom control/panes, escaping above the app's `z-40` sticky header once the map scrolled under it. Fixed with `isolation: isolate` on the map's wrapper div — a spec-guaranteed containment, confirmed via computed style on a live page.
- [x] **Q4** Pending-approval badge: added to **both** the sidebar's "Approvals" item and — the more prominent, actual "approval bar" — the top tab strip in `header.tsx`. New `useApprovalsPendingCount()` hook (`useWorkflows.ts`) calls the already-role-scoped `GET /workflows/approvals/stats`. Verified live as Finance: real badge showing "1" on the Approvals tab.
- [x] **Q5** Final Inspection approval: **found to be a fully missing feature, not a polish issue** — gate X1's failing-check link went to `/reports`, which was a bare `ComingSoonCard` for every role that reaches it (owner, PM, HR, finance). Rebuilt `shared-reports.tsx` into a real engineering-reports list with Approve/Reject/Request-revision for project-manager/admin (server-enforced), read-only for the others; added `dbId`/`updateStatus` to the engineering-reports feature layer. Verified live end to end: approved a real Submitted Final Inspection report as PM, watched it move to the Approved tab.
- [x] **Q6** Payroll computation: **found and fixed the root cause** — every seeded demo employee had `payRate = 0` (the column's own default; `seed-demo-accounts.ts`'s employee insert never set it), so every payroll batch Finance reviewed showed gross/deductions/net all ₱0 regardless of hours or headcount, looking completely broken. Fixed the seed script with realistic per-role PHP rates and backfilled the 50 existing demo employees live. Also fixed the same hardcoded-reviewer-name bug as Q2 (`reviewedBy: "Finance Manager"` → `user?.name`). Verified live: generated a fresh batch (2 employees, 160h+10h OT) and got real, correctly-computed figures (₱76,250 gross → ₱65,814.99 net matching the statutory formula), approved it successfully with the real reviewer name recorded.

All test data (workflows, issues, payroll batches, budget bumps, phase flips) created for verification was cleaned up afterward.

## Questions

(none yet)
