EasyConstruct — Issue List
Categories below are kept exactly as reported, even where a description clearly describes functionality for a different role than the category it's filed under (noted at the bottom).

Admin / Super Admin
EC-001 — Cannot assign roles within a workflow
Type: Missing Functionality The assigned admin must be able to assign a Project Manager, Architect, Engineer, Site Personnel, and Consultant to a specific workflow. No such assignment interaction currently exists.
Status: Fixed.
Finding: The backend already fully supported this — workflow_stages.assignedTo and stageAssignments on createWorkflowSchema were wired through service.createWorkflow (server/src/workflows/service.ts:113-121) — the entire gap was that NewWorkflowDialog never collected or sent it. Once a template is picked, the dialog now renders one assignee <Select> per stage in that template's defaultStages, each populated via UserRepository.listByRole(stage.role) (client/src/components/workflows/new-workflow-dialog.tsx). A role with zero users shows "No users with this role" and stays optional — it never blocks submission. Files changed: client/src/components/workflows/new-workflow-dialog.tsx. Verified live: created a workflow via POST /api/workflows with stageAssignments for all 3 stages of the Design Proposal Approval template; GET /api/workflows/:id confirmed assignedTo populated correctly per stage ("Ana Villanueva", "Elena Bautista", "Miguel Santos").

EC-002 — Internal Server Error on project creation
Type: Bug Creating a new project via the New Project form throws an Internal Server Error.

EC-003 — Admin can approve workflow stages that aren't assigned to Admin
Type: Bug / Access Control Admin should only be able to approve/decide on a workflow stage when the stage's required role is Admin. Currently Admin can approve stages meant for other roles.
Status: Decision made — keep current behavior, not a bug.
Finding: This is an intentional escalation path (an admin/super-admin can decide any stage regardless of its assigned role, e.g. when the actual role-holder is unavailable), not an access-control bug. Per product decision, the override stays exactly as implemented — no functional change was made. Added a code comment above the isPrivileged check in server/src/workflows/service.ts documenting that this is deliberate, so it doesn't get "fixed" away by a future pass. Files changed: server/src/workflows/service.ts (comment only).

EC-004 — File uploads fail on the Design form
Type: Bug / Configuration The Design form does not allow inserting files. Error returned: "File storage is not configured — set BLOB_READ_WRITE_TOKEN (connect a Vercel Blob store to this project)."

EC-005 — No workflow interaction before approval
Type: Missing Functionality The Architect must be able to interact with (view/review) the details of a workflow before approving it — this interaction is currently missing.
Status: Fixed.
Finding: Reused pm-workflows.tsx's existing "Active pipeline" stage-pipeline UI rather than building a new one — extracted it into a shared client/src/components/workflows/workflow-stage-pipeline.tsx component (also now used by pm-workflows.tsx and admin-workflows.tsx, replacing their duplicated inline versions), and added a per-stage comment display since decisions can carry comments. Added a "View details" action to each row in the shared Approvals page (the same component PM, Architect, Consultant, Engineer, and Finance Manager all use at /approvals) that opens this pipeline (read-only) for that workflow, fetched via the existing GET /workflows/:id. This closes the same gap tracked under EC-008 ("no way to justify/comment before deciding") — see EC-008 for the comment-input half of this same piece of work. Files changed: client/src/components/workflows/workflow-stage-pipeline.tsx (new), client/src/pages/roles/project-manager/pm-approvals.tsx, client/src/pages/roles/project-manager/pm-workflows.tsx, client/src/pages/roles/admin/admin-workflows.tsx. Verified live: logged in as both Project Manager and Architect, opened a workflow's "View details" from /approvals, confirmed the full stage pipeline (including a prior stage's decision comment) rendered correctly before deciding. Same shared component/endpoint serves Consultant/Engineer/Finance Manager/HR — not separately re-verified per role since it's identical code and data path.
Related: EC-008's original ticket ("no way to justify the engineer") also needed a comment input on the decide action itself (not just viewing history) — that was added in the same pass: a Textarea now sits above the Approve/Reject buttons on the shared Approvals page, wired to the decideStage endpoint's existing (previously unused) `comments` field. Engineer and Human Resources were also given nav/resource access to /approvals, since neither could reach any decide-stage UI before this pass (server/src/... already allowed both roles server-side; client/src/config/role-resources.ts and role-tab.ts were the actual gap). Verified live: engineer JWT successfully calls GET /workflows/approvals.

EC-006 — Design table doesn't show uploaded designs
Type: Bug The Design table must display the uploaded design documents; it currently doesn't.

EC-007 — Draft requirement form doesn't submit
Type: Bug The requirement form fails to submit when saving as a draft.

EC-008 — No way to justify the engineer within a workflow
Type: Missing Functionality There is no workflow interaction defining where or how the engineer's justification (e.g. for a budget/change request) is entered.

Architect
EC-009 — No workflow interaction for Finance review
Type: Missing Functionality There is no workflow interaction defining where or how the Finance review step is performed.

EC-010 — Missing HR verification step for subcontractor onboarding
Type: Missing Functionality There is no workflow step allowing HR to approve/verify the subcontractor onboarding process.
Status: Fixed — smaller than expected.
Finding: Initially added a new "Subcontractor Onboarding" seed template (matching the pattern of the two templates already in server/src/scripts/seed-demo-accounts.ts), but discovered a pre-existing "Subcontractor onboarding" template (id 3, lowercase) already in the live workflow_templates table — seeded outside this script, predating it — that already has a human-resources stage (HR Verification → Project Manager → Admin Sign-off). Removed the redundant new template/row rather than duplicate it. The only real gap was that Human Resources had no nav/resource access to /approvals at all (client/src/config/role-resources.ts, role-tab.ts) — a one-line addition, same pattern as EC-008's Engineer fix. No new approvals page needed; the shared component already scopes by requester role once HR can reach it. Files changed: client/src/config/role-resources.ts, client/src/config/role-tab.ts (server/src/scripts/seed-demo-accounts.ts touched then reverted to a comment noting why). Verified live: created a workflow from template id 3, confirmed GET /workflows/approvals?scope=pending returns the HR-Verification stage for the hr@easyconstruct.demo account, and that HR can PATCH .../decision to approve it (stage moved to "done", pipeline advanced to Project Manager).

EC-011 — Data tables don't hot-reload
Type: Bug / UX Data tables must update automatically when changes or workflow actions are made, instead of requiring a manual refresh.

EC-012 — Cannot add new clients
Type: Missing Functionality The admin must be able to add new clients to the client/owner options used in project information.

EC-013 — Cannot assign Engineer/Architect during project creation
Type: Missing Functionality The admin must be able to add an Engineer and an Architect at the point of project creation, not only afterward.
Status: Fixed — see EC-013/017/018/024 note below for the shared schema change this and three other tickets were built on.
Finding: ProjectCreatePage's "Team & stakeholders" step now renders an optional picker per role (Architect, Engineer, Site Personnel, Consultant) using the same useUsersByRole pattern already used for the PM picker on that page. On submit, after the project is created, a project-members row is created for each role the admin/PM picked (best-effort — a failed assignment doesn't block navigation, since the project already exists and the assignment can still be made from the detail page). Files changed: client/src/features/projects/pages/ProjectCreatePage.tsx. Verified live: created a project as PM, selected an Architect in step 4, submitted, and confirmed GET /api/project-members?projectCode=... returned that architect's row immediately — no second step required.

EC-013/017/018/024 — shared schema change
Before implementing any of EC-013/017/018/024, evaluated project_members (a single generalized table) against adding a parallel project_architects table. Audited every file touching the existing engineer-only project_engineers table first: it was referenced in exactly 8 server files and 5 client files (schema, one validator, the project-engineers module's 4 files, app.ts's mount point; client repository/hook, ProjectDetailPage, the EC-025 engineer-dashboard KPI fix from the previous pass, and the architect design-create engineer picker) — a small, well-contained surface. Critically, designs.assignedEngineerId (the one place a design references "an engineer") points at users.id directly, not at this table, so generalizing it couldn't break that relationship. Given that footprint, generalizing was clearly smaller and safer than standing up a second near-duplicate table (and the alternative — one parallel table per role — would have been strictly worse, more duplication, not less). Went with project_members: renamed the table (metadata-only, Postgres RENAME TABLE, no data copy) via the same out-of-band ensure-demo-schema.ts script the previous pass's contract_value fix used, added a role column (backfilled to 'engineer' for all 10 pre-existing rows, since every one of them predates this generalization and was always an engineer), and widened the unique constraint to (project_code, user_id, role). Renamed the module end-to-end: server/src/db/schema/project-engineers.ts → project-members.ts, server/src/project-engineers/ → project-members/, server/src/validators/project-engineer-validators.ts → project-member-validators.ts, the API mount from /api/project-engineers to /api/project-members, and the equivalent client/src/features/project-engineers/ → project-members/ files. This went the direction described in the brief, not a different one.

EC-014 — Project creation doesn't return to the project list
Type: Bug / UX After successfully creating a project, the user should be returned to the Projects tab showing the project table; this doesn't currently happen.

EC-015 — Cannot download or preview documents
Type: Missing Functionality The admin must be able to download or preview documents directly from the document repository's data table.

EC-016 — No workflow management UI
Type: Missing Functionality The admin must be able to create, assign, delete, and modify workflows. No such management interface currently exists.
Status: Fixed (edit + delete; "assign" was already covered by EC-001's stage-assignee picker).
Finding: Added PATCH /workflows/:id (title/projectCode/severity/type only — stage reassignment is EC-001's job, not this) and DELETE /workflows/:id, following the same repository → service → controller → validator → routes layering as the rest of the module. Route-level gate is project-manager/admin/super-admin (requireRole); within that, a new assertCanManageWorkflow check in server/src/workflows/service.ts restricts non-admin callers to workflows they created (workflows.createdBy), admin/super-admin bypass it — same ownership pattern as EC-017. workflow_stages already had onDelete: "cascade" on the FK, so deleting a workflow cascades its stages with no extra code. Added Edit/Delete icon buttons to each card in both pm-workflows.tsx's and admin-workflows.tsx's "Active pipeline" tab, gated client-side to the workflow's creator or admin. Found and fixed a real bug while testing the edit dialog: its title field initialized from a useState default that only runs once on mount, so re-opening it for a different workflow silently showed a stale/empty title — fixed with a useEffect keyed on the workflow prop. Files changed: server/src/workflows/{types,repository,service,controller,routes}.ts, server/src/validators/workflow-validators.ts, client/src/features/workflows/{types/workflow.types,repositories/workflow.repository,hooks/useWorkflows}.ts, client/src/components/workflows/edit-workflow-dialog.tsx (new), client/src/pages/roles/project-manager/pm-workflows.tsx, client/src/pages/roles/admin/admin-workflows.tsx. Verified live: edited a workflow's title as its creating PM (persisted, confirmed via GET); attempted the same edit as a second, unrelated PM account and got 403 "You can only edit or delete workflows you created"; deleted a workflow and confirmed its 3 stage rows dropped to 0 via a direct DB count before/after. Verified the edit dialog fix in the browser UI (title now pre-fills and saves correctly); the delete button's native `confirm()` dialog auto-cancels under browser automation, so that specific click path was verified via direct API call instead (same delete/cascade result confirmed above).

EC-017 — No workforce-assignment restriction/handoff
Type: Missing Functionality The admin should only assign a Project Manager to a project, and the PM should then be the one to configure the workforce needed for that project — this handoff isn't implemented.
Status: Fixed (the one concrete gap); the rest of the described behavior was already correct.
Finding: Verified the admin creation form already only ever lets you assign a PM (no over-assignment existed), and PMs could already configure their own project's engineers post-creation via project_engineers (now project_members) — the handoff itself was already structurally correct. The actual gap: POST/DELETE on that table had no ownership check — any authenticated project-manager (not just the project's actual PM) could add/remove staff on any project. Added an assertCanManageProject check in server/src/project-members/service.ts (mirrors the documents PM-scoping fix from the previous pass: looks up the target project's `pm` field and compares against the requester's name; admin/super-admin bypass it). Files changed: server/src/project-members/service.ts, server/src/projects/{repository,service}.ts (added findByCode/getByCode to support the check). Verified live: as the owning PM, assigning an engineer still succeeds (201); as a second, unrelated PM account, the identical request now returns 403 "You can only manage the workforce of projects you manage" instead of silently succeeding.

Engineer
EC-018 — Cannot add team members during project configuration
Type: Missing Functionality The Project Manager must be allowed to add Architect, Engineer, Site Personnel, and Consultant to a project.
Status: Fixed — see the EC-013/017/018/024 shared schema note under EC-013.
Finding: ProjectDetailPage's engineer-only "Available engineers" panel was generalized into a reusable TeamMemberPanel(role, label, description) component, rendered four times (Engineer/Architect/Site Personnel/Consultant), each an independent add/remove list scoped to that role via project_members. Files changed: client/src/features/projects/pages/ProjectDetailPage.tsx, client/src/features/project-members/{repositories/project-member.repository,hooks/use-project-members}.ts. Verified live: as PM, added an Architect and a Site Personnel to a project from the detail page; both appeared correctly under their respective panels, and the pre-existing Engineers panel (2 members) was untouched.

EC-019 — Document repository not scoped to the PM's projects
Type: Bug / Access Control The Project Manager should only see documents related to the project(s) tied to their account; currently the repository isn't scoped this way.

EC-020 — Design form doesn't auto-set the creating architect
Type: Bug The Design form should automatically populate the architect field with the architect who is creating the design.

EC-021 — Internal Server Error on file upload
Type: Bug Uploading a file results in an Internal Server Error.

EC-022 — Proposal data table column width
Type: UX Enhancement The Proposal data table needs a more fixed/consistent column width for readability.

EC-023 — Cannot archive proposal rows
Type: Missing Functionality The Architect must be able to archive a row in the Proposal data table.

EC-024 — Project tab doesn't reflect PM's architect assignment
Type: Bug When the Project Manager assigns a project to a specific architect, the Project tab does not reflect that assignment.
Status: Fixed — fell out of the EC-013/018 schema/UI work as expected, no separate code needed.
Finding: There was previously no data model at all for "PM assigns an architect to a project" (no column, no table) — this is now the project_members table with role='architect', displayed by ProjectDetailPage's Architects panel. Verified live: the architect assigned in the EC-018 verification step showed up immediately in the Architects panel with no additional work. Note: the Architect's own "Projects" tab (client/src/features/designs/controllers/architect-projects.controller.ts) still scopes by "has any design linked to this project" rather than by this new project_members(role=architect) assignment, and separately uses an unauthenticated raw fetch() — both pre-existing issues left untouched as out of scope for this pass (not one of the 7 items).

EC-025 — Engineer dashboard KPI not connected
Type: Bug The logged-in Engineer needs a working dashboard — specifically, the "Your assigned projects" KPI must show the project(s) actually connected to that engineer's account (currently not reflecting real data).

Finance Manager
EC-026 — Project detail view missing / not read-only for Engineer
Type: Missing Functionality / Access Control The Projects data table needs a working "Open" button that shows project details, and this detail view must be read-only (non-editable) when viewed as/by Engineer.

Human Resources
EC-027 — No confirmation or KPI update after creating an engineering report
Type: Bug / UX When an engineering report is created via the Progress tab, there's no indication it was successfully created, and it doesn't show up in the "recent site reports" KPI.

Project Manager
EC-028 — Progress tab uses static data
Type: Bug Task progress on the Progress tab must reflect dynamic, real data instead of static placeholder data.

EC-029 — No save feedback on draft requirement
Type: UX Enhancement Saving a requirement draft needs simple haptic (or equivalent) feedback to confirm the save occurred.

Site Personnel
EC-030 — Cannot save a requirement draft
Type: Bug The draft-saving action for requirements does not work for Site Personnel.

EC-031 — No upload feedback on Documents
Type: UX Enhancement Uploading a document needs simple feedback (confirmation/progress indicator) so the user knows the upload succeeded.

EC-032 — Submit Issues is broken
Type: Bug Submitting an issue does not work.

Workflow / Approval backend
EC-033 — Tasks tab non-functional
Type: Bug The Tasks tab must be made to work.

Note on categorization
EC-009 through EC-017 are filed under Architect, but their descriptions are about Admin- or Project-Manager-facing functionality (workflow management, client/project creation, workforce assignment) rather than anything Architect-specific. Categories were kept as originally given rather than reassigned — worth checking whether this is intentional or a labeling mistake upstream before triage.