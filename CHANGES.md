# Roles & Permissions hierarchy view + proposal side panel

Branch: `staging`. No migration, no change to how permissions are enforced.

## What was built

**Roles & Permissions** (`/admin/roles-permissions`, `/it-designer/roles-permissions`)
- Default view is a top-down hierarchy of the ten roles; a toggle switches to a Matrix (roles x pages).
- Admin and IT Designer are siblings on one row under Owner, joined by one bracket chip "System governance".
  The three departments hang from the middle of that bracket.
- Node cards: icon avatar, role name, active-user count, View button. Zoom in / out / reset, dotted canvas,
  under 768px it collapses to an indented list. A helper line states the hierarchy is display only.
- Role side panel tabs: Overview, Permissions, Users, History. Header shows a "View only" badge.
- **Read-only for everyone, including IT Designer** (see "Not done" below).

**Proposal details open in a right-hand panel** on every proposal page; the old below-the-table (Owner, IT Designer)
and full-page (Consultant) detail views are removed.
- List ~60% / panel ~40% (min 420px) from 1024px, a `Sheet` under that.
- Selected row: tinted green with a green left accent bar. Selection lives in the URL (`?selected=<id>`),
  Esc closes, Arrow Up/Down steps through the rows.
- Tabs: Overview (Basic Information, Proposal Content, Rule-based Validation), Content, Validation, History, Related.
- Consultant's comment box and Approve / Request revision / Reject are in the sticky panel footer.

## Role-key mapping

The real keys (`users.role` / `roles.name`) were used; they match the requested layout:

| Chart label | Key |
|---|---|
| Owner | `owner` |
| Admin | `admin` |
| IT Designer | `it-designer` |
| Project Manager | `project-manager` |
| HR | `human-resources` |
| Finance Manager | `finance-manager` |
| Architect | `architect` |
| Engineer | `engineer` |
| Consultant | `consultant` |
| Site Personnel | `site-personnel` |

The client's own role names use underscores (`it_designer`, ...); `config/role-mapping.ts` converts between them.
The tree is data in `features/roles/role-hierarchy.ts`.

## Not done, and why

The brief asked for IT Designer to toggle View/Create/Edit/Approve/Delete per module, enforced on the next request,
with an audit entry. That needs a rewrite of how access is enforced, so I stopped at the read-only version as instructed:

- Server: 130 `requireRole(...)` calls across 52 route files, no module/action table.
- Client: page-level `ROLE_RESOURCE_ACCESS` (role -> list of pages) in `config/role-resources.ts`, read by
  `providers/access-control-provider.ts` and `RequireRole` in `App.tsx`.
- There is no `role_permissions` table and no action-level concept, so the Permissions tab shows page access
  (from the client map) and says action-level rules live on the server.
- The History tab is an empty state: nothing is editable, so there is nothing to audit.

## Files

Client, new:
- `components/detail-panel/DetailPanel.tsx` (DetailPanel, SplitDetailLayout, selectedRowClass)
- `hooks/use-selected-param.ts`, `hooks/use-media-query.ts`
- `features/proposals/ProposalDetailPanel.tsx`
- `features/roles/role-hierarchy.ts` (+ `.test.ts`), `features/roles/hooks/useRoleAccounts.ts`
- `features/roles/components/RoleHierarchyTree.tsx`, `RoleMatrix.tsx`, `RoleSidePanel.tsx`

Client, changed:
- `pages/roles/admin/admin-roles-permissions.tsx` (rewritten)
- `features/proposals/components/ProposalsRegister.tsx`, `ProposalsTable.tsx`
- `pages/roles/consultant/consultant-proposals.tsx`, `pages/roles/architect/architect-proposals.tsx`
- `features/roles/repositories/role.repository.ts`, `config/pagination-exempt.ts`

Server, changed (read-only addition):
- `roles/repository.ts`, `service.ts`, `controller.ts`, `routes.ts`: `GET /api/roles/summary` (active users and accounts per role)

## Not changed

- The workflow-approval queue (`components/workflows/approval-queue-panel.tsx`) decides workflow stages, not proposal
  rows, so it was left alone.
- Architect's Proposals page had no detail view before; it now opens the same panel (read-only; edit, attach and archive stay in the row).

## Verified

- `tsc` passes on client and server; client `npm run build` succeeds; client tests (316) pass; lint has no errors in touched files.
- **Not verified in a browser.** The in-app browser did not render the dev server in this session, so layout, the connector
  lines, zoom, and the sheet breakpoint have only been type-checked and built, not seen.

---

# Roles & Permissions: professional visual pass

Visual and layout only. Permission logic, the permission source and who can edit are unchanged
(everyone is still view-only; Admin sees the "View only" badge, there is no Edit action for anyone).

## What changed

- **Layout engine.** Cards are positioned with `d3-hierarchy`'s `tree()` (`features/roles/role-layout.ts`) and the
  Admin + IT Designer pair is one virtual parent, so Owner and the department row are centred on it. The chart is
  symmetric (People and Finance flank Project delivery), covered by tests.
- **Connectors** are one SVG layer behind the cards: orthogonal elbows with 6px rounded corners, 1.5px stroke, no
  arrowheads, the Owner-to-selected path in primary at 2px. The department bus starts at the midpoint between Admin and IT Designer.
  Paths are computed from the card geometry (cards have a fixed size and absolute positions), not measured with a
  ResizeObserver, so lines meet card edges exactly without a measure-then-redraw flash.
- **Tier rail and bands** (Executive, Governance, Department leads, Project team, Field) with alternating row bands.
- **Group containers** (dashed outline, `NAME · count` header, a coloured dot as the only accent) replace the chips.
- **Node card** (256 x 96): in-card icon tile, name, mono role key, avatar stack, users and pages, access badge
  (Full / Manage / Monitor / Operational). The whole card opens the existing side panel; hover menu has View details and
  View users (Edit permissions is only offered when the viewer can manage, which nobody can today).
- **Canvas.** Faint dots, floating toolbar (zoom out, %, zoom in, fit, reset; 50 to 150%), ctrl/cmd + wheel zoom, drag to pan,
  fit on load and on resize until the user pans or zooms, legend strip under the canvas, no dead space below the last row.
- **Header.** Stat strip (roles, active users, departments, last permission change), role search that dims non-matches and
  pans to the first match, Tabs-style Hierarchy / Matrix toggle, the display-only note moved into an Info tooltip.
- **Accessibility.** `role="tree"` / `treeitem`, arrow keys (parent, child, siblings), Enter opens the panel, Esc closes it,
  visible focus ring, 150ms transitions that respect `prefers-reduced-motion`.
- **Under 768px:** grouped, indented list by tier, with the same card in compact form.
- **Matrix:** transposed to roles (rows) x pages (columns grouped by sidebar section), sticky role column and header rows,
  the same icon tile and access badge, search dimming.

## Differences from the brief

- Department order is People, Project delivery, Finance (not Project delivery first), so the widest subtree sits in the centre and the chart is symmetric.
- "24 permissions" is shown as "24 pages": the number is the pages a role can open, not action-level permissions.
- "Last change: name, time" shows "No permission changes recorded": permissions are defined in code, so there is no audit trail for them.
- Matrix switches for IT Designer are not added: there is no editable permission source (see above).
- At 1280 to 1440px the tree fits at about 50 to 60% zoom (it is 1,700px wide), so card text is small until you zoom in; 100% plus pan is one click.
- `Esc` closes the panel; the "View only" badge is shown for every viewer.

## Files

New: `features/roles/role-layout.ts`, `components/RoleHierarchyCanvas.tsx`, `components/RoleNodeCard.tsx`.
Rewritten: `features/roles/role-hierarchy.ts` (adds `group`, `tier`, `accessLevel`, groups, tier labels), `components/RoleMatrix.tsx`,
`pages/roles/admin/admin-roles-permissions.tsx`, `role-hierarchy.test.ts`.
Changed: `components/RoleSidePanel.tsx` and `components/detail-panel/DetailPanel.tsx` (optional `defaultTab`),
`config/pagination-exempt.ts`. Removed: `components/RoleHierarchyTree.tsx`.

## New dependency

`d3-hierarchy@3.1.2` (client) and `@types/d3-hierarchy` (dev). No DOM dependencies, a few kB.

## Verified

`tsc`, client build and all 323 client tests pass. Checked in a real browser (headless Chrome against the local dev server) at 1440 and 1280px
in light and dark, plus a 390px phone width: layout, symmetry, connectors, panel, search dimming, keyboard (arrows, Enter, Esc), and that Admin
sees "View only" with no Edit control. Lint has no errors in touched files (one existing error in `admin-dashboard.tsx` is not from this change).
