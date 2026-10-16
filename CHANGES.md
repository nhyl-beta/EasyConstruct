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
