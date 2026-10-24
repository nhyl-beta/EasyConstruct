# Bug fixes and demo reset: progress

Branch: `thesis-final-staging` (created locally from `origin/thesis-final-staging`; nothing pushed).

## Part B: skipped

Part B skipped: owner switches are NO (`OWNER_CONFIRMS_NEON_BRANCH_COPY: NO`, `OWNER_CONFIRMS_RUN_RESET: NO`). No script was run against any database, and no `.env` file was read.

## Bug 1: milestone dates must not be in the past

Rule: a milestone's estimated completion date must be today (Manila) or later. Past dates are rejected on create and when an update moves a milestone to a new past date. Editing a milestone whose stored date already passed (rename, complete, change status) still works.

"Today" is `todayManila()` from `apps/api/src/core/utils/dates.ts` on the server and `todayManilaIso()` (same Asia/Manila logic) on the web.

### Files changed
- `apps/api/src/modules/projects/milestones/validators.ts`: `milestoneDateIssue`, `redateIssue`; `createMilestoneSchema` rejects a past or non-ISO date.
- `apps/api/src/modules/projects/milestones/service.ts`: `create` re-checks the date (covers callers that skip the route validator); `update` refuses a changed date that is in the past.
- `apps/api/src/modules/insights/plan-suggestion/service.ts`: accepting a suggested milestone whose computed date is already past uses today instead.
- `apps/api/scripts/demo/demo-seed-stages.ts`: milestones are posted through the API, so a past date is moved to `TODAY + 14 * n` days.
- `apps/web/src/features/milestones/lib/milestone-date.ts` (new): shared rule and message.
- `apps/web/src/components/ui/date-picker.tsx`: optional `onRejected` callback, so a typed date refused by `min` can show a message instead of silently snapping back.
- `apps/web/src/features/projects/pages/ProjectCreatePage.tsx`: `min` on the milestone date, check in `addMilestone`, step 2 in `validateStep` (also re-run at submit), inline message, past drafts shown in red.
- `apps/web/src/features/milestones/components/MilestonesPanel.tsx`: same for "Draft a milestone" and "Edit milestone" (edit refuses only a changed date).

### Places checked
| Place | Result |
| --- | --- |
| Create Project step 2 (`StepScopeSchedule`, `validateStep`, submit loop) | changed |
| `MilestonesPanel.tsx` new-milestone dialog | changed |
| `MilestonesPanel.tsx` edit dialog | changed (only a changed date is refused) |
| `POST /milestones`, `createMilestoneSchema` | changed |
| `PATCH /milestones/:id`, `milestones/service.update` | changed |
| Plan suggestions: server accept (`plan-suggestion/service.ts`) | changed (clamped to today) |
| `SuggestedPlanPanel.tsx` (web) | no change needed: accept-only, no date input |
| `EngineerMilestonesCard.tsx` / `use-engineer-milestones.ts` | no change needed: engineers can only mark completed |
| `ProjectDetailPage.tsx` | no change needed: project dates, not milestone dates |
| Task due dates (`tasks/service.ts`) | no change needed: tasks, not milestones |
| `lifecycle-walk.ts` (system check) | no change needed: uses `TODAY + 60 days` |
| `demo-seed-stages.ts` | changed (see above) |
| Existing milestone-related tests | no change needed (none call create/update with fixed past dates) |

Relationship rules (milestone vs project start/end): none exist in the app today, so none were added or weakened.

### Tests added
- `apps/api/src/modules/projects/milestones/validators.test.ts`: yesterday rejected, today and future accepted, Manila 02:00 (UTC date a day behind), Manila midnight boundary, non-ISO, stored past date on update, schema-level checks with a mocked clock.
- `apps/web/src/features/milestones/lib/milestone-date.test.ts`: past (including a keyboard-typed one), today, future, empty, Manila day boundary, re-date rule.

### Not verified
- The wizard's DOM behavior (the typed-date message and the Add button) was not exercised in a browser; the web test environment has no DOM, so the rule is tested as a pure function and the wiring was only type-checked.
- Not tested against the real Render server or Neon.

## Bug 2: Site Personnel photos from the live camera only

### Every place a Site Personnel user can attach an image
| Place | Used by Site Personnel? | Result |
| --- | --- | --- |
| `sp-attendance.tsx` verification photo | yes | **changed**: `CameraCapture`, no file input; required |
| `sp-attendance.tsx` `AttendanceSheetImport` (Excel) | yes | no change: spreadsheet import, not a photo |
| `components/tasks/complete-task-dialog.tsx` | yes, via `sp-tasks.tsx` | **changed**: `cameraOnly` prop (on for the site-personnel role); photo from camera, picker is PDF-only and refuses images |
| `sp-documents.tsx` | yes | **changed**: Site Photo and Progress Evidence get a camera button; the file picker refuses images for every type |
| `features/issues/components/ReportIssueDialog.tsx` | no (only rendered on the Engineer issues page) | no change needed |
| `sp-issues.tsx` | yes | no change needed: no attachment field |
| `components/documents/upload-document-dialog.tsx` | no (PM, Architect, Reports tab) | no change (other roles keep gallery uploads) |
| `components/shared/file-list-picker.tsx` | no (Engineer requirements) | no change |
| Other `type="file"` inputs (finance, workflows, RFI reply, revisions, project detail Design files, etc.) | no | no change |

### Files changed
- `apps/web/src/components/shared/camera-capture-logic.ts` (new): `startCameraStream`, error classification, `captureFrame` (long side 1600 px, JPEG 0.8, `capture-<timestamp>.jpg`), `stopStream`.
- `apps/web/src/components/shared/CameraCapture.tsx` (new): dialog with live preview, Capture, Retake, Use photo, Cancel, Try again. Tracks stop on close, on unmount and when a capture is accepted. No file input, no drag-and-drop, no fallback.
- `sp-attendance.tsx`, `complete-task-dialog.tsx`, `sp-tasks.tsx`, `sp-documents.tsx` as above. The geolocation step and the upload flow (`useUploadFile`, offline queue) are unchanged.

### Failure messages
Permission denied, no camera, camera busy, insecure context (not HTTPS), unsupported browser. In every case no photo can be produced; there is no silent fallback.

### Tests added
`apps/web/src/components/shared/camera-capture-logic.test.ts`: mocked `getUserMedia` (success with the rear-camera constraint, denied, no device, busy, insecure, unsupported), track stopping, resize and file name, frame capture, and source-level checks that the Site Personnel pages have no free image picker.

### Not verified
- A real phone camera (iOS Safari, Android Chrome) and a laptop webcam.
- The component itself is not rendered in a test: there is no DOM test environment (no jsdom or testing-library) and no dependency was added. The page checks read the source. Adding `jsdom` and `@testing-library/react` would allow real render tests.
- Camera permission prompts on the deployed HTTPS site.

### Visual checklist for the owner
Phone (Site Personnel account, HTTPS site):
1. Attendance, "Take verification photo" opens a live rear-camera preview; the browser asks for camera permission once.
2. Capture freezes the frame; Retake returns to live; Use photo shows the thumbnail and enables Confirm (with location verified and a project chosen).
3. There is no "Choose file", gallery or Files option anywhere in that flow.
4. Deny the permission: a clear message and a Try again button; Confirm stays disabled.
5. Tasks, Complete task: "Take a photo" works; "Attach a PDF document" does not list images; choosing an image anyway shows a refusal message.
6. Field Documentation: choose Site Photo, "Take photo" works; choose Field Report, only the document picker shows and an image is refused.

Laptop: the same, using the webcam; with no camera, the "No camera was found" message appears. Also log in as a PM or Engineer and confirm their uploads still accept gallery images.

### Important limit
This is a front-end control. The server cannot prove an image came from the camera, so a determined user could still post a file to the upload API directly. Suggested hardening (not built): record the capture time with the photo (for example a server-issued timestamp when the camera opens) and require the attendance photo's capture time to be within a few minutes of the clock-in request; reject reused photo hashes.

## Open questions
- Plan suggestions: a suggested milestone whose date is already past is created with today's date (the PM can move it). Alternative: refuse to accept it. I chose clamping so a plan can still be accepted.
- Non-ISO milestone dates are now refused on create (previously accepted loosely). The UI always sends ISO.
- Site Personnel `Progress Evidence` is treated as a photo type (camera plus a non-image picker); if it should also accept scanned images, that needs a decision.
- The Site Personnel document picker now lists PDF/Office/CSV/text via `accept`; the server's own type checks are unchanged.
- `ReportIssueDialog` was left alone because Site Personnel never reaches it.
- The local branch `thesis-final-staging` did not exist; it was created from `origin/thesis-final-staging`. `tempec-check/` (untracked) was left untouched.

## Verification results
- `npm run lint` (api, web): 0 errors (existing warnings only).
- `npm test` api: 963 passed, 0 failed. web: 353 passed, 0 failed (26 files).
- `npm run build:server`: passed. `npm run build:client`: passed (existing bundle-size warning).
- `npm run typecheck --workspace=@easyconstruct/web`: no errors.
- API `tsc --noEmit`: 0 `error TS` lines, no new errors versus `refactor-notes/baseline.md` (also 0). The final command in the batch exited 1 only because `grep -c` returns 1 when the count is 0.
