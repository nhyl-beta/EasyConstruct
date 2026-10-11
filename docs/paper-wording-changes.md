# Paper wording changes (scope vs. system)

Source: the scope-vs-system audit (`scope-vs-system-audit.md`) and the
`feature/engineer-consultant-alignment` build pass. This list covers every audit
item that pass **deliberately did not build**. Each row has a ready-to-paste
replacement sentence and a marker so the owner can choose per item:

- `reworded in paper` — change the manuscript to the replacement sentence; no code needed.
- `build later` — keep the manuscript claim and schedule the work (listed under "Not built").

Default recommendation is shown in the **Choice** column; change it to flip.

Items the pass **did** build (so the manuscript can keep the original claim): Engineer requirement
structuring, issue reporting with ranked precedents, and milestone completion; Site Personnel
requirement submission; Consultant design files / design-review context / advisory uploads tied to a
proposal or design / on-demand validation summary; removal of "Coming soon" placeholders.

## Global

| # | Where | Replacement sentence | Choice |
|---|---|---|---|
| G1 | Every role: "AI-generated …", "AI-assisted …" | Replace "AI-generated" and "AI-assisted" with "rule-based decision support", e.g. "The system provides rule-based decision support; a person always makes the final decision." | reworded in paper |
| G2 | Limitations section | Keep the existing Limitations paragraph: AI features are deterministic, rule-based decision support (no generative model, no external AI service); they never block, approve or reject on their own. They are only available when the AI feature flag is enabled. | reworded in paper |

## Consultant

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| C1 | Proposal Review and Workflow Participation | "The Consultant can review submitted project proposals and rule-based validation summaries, record an approve / request-changes / reject decision as an advisory recommendation, and participate in or initiate relevant workflows such as document compliance review." | reworded in paper |
| C2 | Design Review (new bullet) | "The Consultant can review designs submitted for review, see the design's attached files, and approve, request changes, or reject them." | reworded in paper |
| C3 | Blueprint Review (new bullet) | "The Consultant can review project blueprints and approve, request changes, or reject them." | reworded in paper |
| C4 | Dashboard / project monitoring | "The Consultant can view the projects they are staffed on, including their status and scope, in a read-only list." (The word "monitoring" overstates a read-only list.) | reworded in paper |
| C5 | Recommendations "based on standards, historical data and external sources" | "Validation summaries are rule-based completeness checks (title, project, description and amount); they do not consult external standards or historical data." | reworded in paper (reference check for proposals: `build later`) |

## Owner

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| O1 | Dashboard: "AI-generated impact reports" | "The Owner dashboard presents executive summaries of portfolio status, reports and the audit trail to support decisions." — or, to keep the claim: "Rule-based impact summaries for the Owner are identified as future work." | reworded in paper (impact cards: `build later`) |

## IT Designer

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| I1 | Dashboard: "AI-generated impact reports" | "The IT Designer dashboard presents live account, role and audit summaries to support system oversight." (The infrastructure-health placeholder was removed.) | reworded in paper (impact cards: `build later`) |
| I2 | Approval Hierarchy: "manage the sequence of reviewers and approvers" | "The IT Designer can view the approval hierarchy of each workflow template; approval sequences are defined when a template is created through Workflow Configuration." | reworded in paper (editing UI: `build later`) |

## Admin

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| A1 | Approval Hierarchy: "view and manage … stages, designated approvers, escalation sequences" | "The Admin can view the approval hierarchy of each workflow template (stages and designated approvers); templates are defined through Workflow Configuration." | reworded in paper (editing UI / escalation sequences: `build later`) |

## Project Manager

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| P1 | Task Management: tasks "categorized and associated with milestones" | "Tasks are prioritized, tracked by status, and associated with milestones." | reworded in paper (task categories: `build later`) |
| P2 | Report Monitoring: "progress, incident, inspection and project completion reports" | "The Project Manager can monitor engineering reports of the following kinds: progress and technical reports, site and quality inspections, safety observations and non-conformance reports, and the Final Inspection report used for project closeout. Field-reported incidents are handled as Issues." | reworded in paper |
| P3 | Resources page | "The Project Manager has a Resources & Tools page with working checklists, downloadable templates (meeting minutes, punch list, daily report, submittal log, RFI/RFA note) and links to the relevant agencies." | **built** (supersedes the earlier removal) |

## Finance Manager

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| F1 | Expenses: "AI-assisted expense anomaly detection" | "Expense review is supported by cost-reference comparison against a published cost catalog and by rule-based anomaly flags: a possible duplicate payment (same vendor and amount within 30 days) and an amount several times the vendor's or category's usual amount. The flags are advisory and state their reason; they never block a payment." Do not describe it as machine learning. | **built** (rule-based, not "AI"; supersedes the earlier future-work wording) |

## Architect

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| R1 | Proposal Submission: recommendations "using construction standards, historical project data and relevant external sources" | "The Architect receives rule-based completeness recommendations on a submitted proposal (title, project, description and amount); they are decision support only." | reworded in paper (proposal reference check: `build later`) |
| R2 | Impact Awareness Viewing | "The Architect sees a read-only impact-awareness view of the projects they are staffed on, listing rule-based advisories on cost, change, schedule and quality, with a link to where each is acted on. The same view is available to the Owner and IT Designer across all projects." | **built** (supersedes the earlier future-work wording) |
| R3 | "Structural requirement requests" | Remove the phrase, or: "Architects can request reviews through the available workflow templates (Design Proposal Approval, Document Compliance Review and Change Order Request)." (No "structural requirement request" template exists.) | reworded in paper (new template: `build later`) |

## Requests for Information / Approval (RFI / RFA) and transmittal

| # | Topic | Wording | Choice |
|---|---|---|---|
| Q1 | RFI/RFA module | "A Request for Information (RFI) or Request for Approval (RFA) is raised by the Project Manager or Engineer against a project, addressed to the responsible Architect or Consultant, and answered inside the system. Each request carries a reference number of the form KIND-PROJECTCODE-DISCIPLINE-SEQ-YY, a due date (three days for an RFI and four days for an RFA by default, editable per request), and a printable form." | **built** |
| Q2 | Transmittal | "Documents sent out are recorded on a transmittal numbered PROJECTCODE-DOC-SEQ-YY, listing the documents, the purpose of issue and the recipient, with a printable form and recorded acknowledgement." | **built** |
| Q3 | Escalation | "An overdue request is flagged once to its assignee and to the Admin; the Admin and Owner see a Needs-attention list of overdue requests. Escalation is notification only; the system does not reassign or approve automatically." | **built** (replaces "escalation sequences" in the approval hierarchy, which stays future work) |
| Q4 | Closing rule | "A project cannot leave Closeout (Construction) or Turnover (Design) while any RFI or RFA on it is still open." | **built** (gate X5) |
| Q5 | Change order link | "A request that states a cost impact can start a Change Order Request workflow pre-filled with the request''s subject and amount." | **built** |

## Design project type

| # | Topic | Wording | Choice |
|---|---|---|---|
| D1 | Delivery type | "A project is either a Construction project or a Design project (plan sets only). A Design project follows Proposal, Design, Turnover, Completed and Archived; it has no Pre-Construction or Construction phase, no site crew, attendance or geofence." | **built** |
| D2 | Plan sets | "A Design project lists the plan sets it will deliver (Architectural, Structural, MEP, Civil, Interior). Each plan set is marked delivered when its drawings are filed; Turnover requires every plan set delivered and a signed Client Acceptance document." | **built** |
| D3 | Turnover approval | "The Design Turnover workflow is approved by the Architect, then the Consultant, then the Project Manager, then the Admin." | **built** |

## Payroll

| # | Scope bullet | Replacement sentence | Choice |
|---|---|---|---|
| Y1 | Payroll limitations | Do not state that payroll is limited to basic pay. The system computes the SSS, PhilHealth and Pag-IBIG contributions (with employer shares and a payslip; employee deductions are only these three contributions) from versioned rate tables, and exports tracksheets and agency contribution reports as CSV. State instead that the rate tables must be kept current by HR and that Finance reviews and approves each batch. | corrected in paper |
| Y2 | Owner payroll visibility | The Owner dashboard presents payroll as read-only, aggregate-level summaries of approved payroll (labor cost, trend, pipeline status, spend by project and group, statutory totals and items needing attention). It shows no individual employee pay data, and the Owner cannot approve, reject, edit or generate payroll. | **built** |

## Purchase requests, procurement and reimbursements

| # | Topic | Wording | Choice |
|---|---|---|---|
| P1 | Purchasing (Engineer, Project Manager, Site Personnel, Finance) | Purchase requests, procurement orders and reimbursements are sub-features of existing modules, not separate modules. An Engineer or Project Manager raises a purchase request from an approved requirement; an Engineer's request is endorsed by the Project Manager; the Finance Manager approves it (a decision note is required when it is over budget), creates the order and, once site staff confirm the delivery, records the payment. Approving a request commits its amount on the project budget; payment releases the commitment and books the spend. | **built** |
| P2 | Employee claims (all claimant roles) | Engineers, Site Personnel, Project Managers, Architects and Human Resources can claim out-of-pocket costs with a receipt. Project staff's claims are endorsed by their Project Manager, then approved and paid by the Finance Manager. Nobody decides or pays their own claim. | **built** |
| P3 | One expense per payment | Every payment of an order or claim creates exactly one approved expense, increases the project budget's actual spend and updates that month's cash flow in a single transaction. | **built** |
| P4 | Closing | A project cannot close (Closeout, or Turnover for a Design project) while any purchase request, order or claim is unsettled. | **built** |

## Also built in this pass (remove from "future work")

- Archive search across completed and archived projects and their documents, within each role''s own project visibility.
- Legacy import: bulk upload of existing documents from a CSV manifest plus files, through the normal upload checks. Importing historic *projects* (past dates, completed phases) is not supported: project creation forces the Proposal phase and a future start date.
- CSV export on Budget, Expenses, Payroll review and Payroll.
- Project Manager dashboard charts (projects by phase, open workload).

## Not built in this pass

These stay unbuilt on purpose; pick `build later` above only if the manuscript must keep the claim:

- Approval-hierarchy editing and escalation sequences (overdue RFI/RFA notification is built; reassignment is not).
- Task categories for the Project Manager.
- Proposal reference check (standards / historical data).
