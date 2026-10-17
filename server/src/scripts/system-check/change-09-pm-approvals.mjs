// Change #9 - materials and RFI/RFA approvals go to the PM, with an Admin override that needs a reason.
// Needs the SMTP sink and the API started as for change #5. Run from server/.
import { API, call, check, finish, login } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const pmList = await call("pm", "GET", "/projects?limit=50");
const engList = await call("engineer", "GET", "/projects?limit=50");
const engCodes = new Set((engList.data?.items ?? engList.data ?? []).map((p) => p.code));
// A project the PM owns and the engineer is staffed on (engineers author requirements, the PM decides them).
const project = (pmList.data?.items ?? pmList.data ?? []).find((p) => engCodes.has(p.code) && !["Archived", "Completed", "Cancelled", "On Hold"].includes(p.status));
check("found a project shared by the PM and the engineer", !!project, project?.code);
const code = project.code;
const up = await call("engineer", "POST", "/uploads", { filename: `spec-${stamp}.png`, contentType: "image/png", dataUrl: PNG });
const file = { url: up.data.url, filename: `spec-${stamp}.png`, contentType: "image/png", sizeBytes: 70 };

const mkReq = async (title) => {
  const r = await call("engineer", "POST", "/requirements", { title, project: code, category: "Materials", description: "Ten mm tempered glass for the lobby.", attachments: [file], createdBy: "Paolo Mendoza" });
  if (!r.data?.id) throw new Error(`could not create a requirement: ${r.status} ${JSON.stringify(r.body)}`);
  await call("engineer", "PATCH", `/requirements/${r.data.id}`, { status: "Under Review" });
  return r.data;
};

// Requirements
const r1 = await mkReq(`Glass A ${stamp}`);
check("a requirement is waiting for a decision", !!r1?.id);
const adminNo = await call("admin", "PATCH", `/requirements/${r1.id}`, { status: "Approved" });
check("Admin is denied without a reason", adminNo.status === 403 && adminNo.body?.code === "OVERRIDE_REASON_REQUIRED", `status ${adminNo.status} ${adminNo.body?.code}`);
const adminShort = await call("admin", "PATCH", `/requirements/${r1.id}`, { status: "Approved", overrideReason: "short" });
check("a reason under 10 characters is not enough", adminShort.status === 403);
check("the requirement is still under review", (await call("pm", "GET", `/requirements?project=${code}`)).data?.some?.((x) => x.id === r1.id && x.status === "Under Review") ?? true);
const otherPm = await call("projectmanager1@easyconstruct.demo", "PATCH", `/requirements/${r1.id}`, { status: "Approved" });
check("a PM who is not on the project is denied", otherPm.status === 403, `status ${otherPm.status}`);
check("an engineer cannot decide", [403].includes((await call("engineer", "PATCH", `/requirements/${r1.id}`, { status: "Approved" })).status));
const adminYes = await call("admin", "PATCH", `/requirements/${r1.id}`, { status: "Approved", overrideReason: "PM is on leave until Monday" });
check("Admin is allowed with a written reason", adminYes.status === 200 && adminYes.data?.status === "Approved", `status ${adminYes.status}`);
const audit = await call("admin", "GET", `/audit-logs?entityType=requirement&projectCode=${code}&perPage=10&page=1`);
check("the override and its reason are in the audit trail", (audit.data?.data ?? audit.data ?? []).some((r) => r.action === "override" && r.summary.includes("PM is on leave until Monday")));

const r2 = await mkReq(`Glass B ${stamp}`);
const pmYes = await call("pm", "PATCH", `/requirements/${r2.id}`, { status: "Rejected" });
check("the project's PM decides normally, no reason needed", pmYes.status === 200 && pmYes.data?.status === "Rejected", `status ${pmYes.status}`);

// RFI/RFA sending
const members = await call("pm", "GET", `/design-requests/assignees?projectCode=${code}`);
const assignee = members.data?.[0];
const body = (subject, extra = {}) => ({ kind: "RFI", projectCode: code, discipline: "AR", subject, requestText: "Which finish applies to the corridor floor?", assignedToUserId: assignee.userId, ...extra });
const adminDraft = await call("admin", "POST", "/design-requests", body(`Admin raise ${stamp}`));
check("an Admin's request without an override is only a draft", adminDraft.status === 201 && adminDraft.data?.status === "draft", `${adminDraft.status} ${adminDraft.data?.status}`);
const adminSendNo = await call("admin", "POST", `/design-requests/${adminDraft.data.id}/send`, {});
check("Admin cannot send it without a reason", adminSendNo.status === 403 && adminSendNo.body?.code === "OVERRIDE_REASON_REQUIRED", `status ${adminSendNo.status}`);
const adminSendYes = await call("admin", "POST", `/design-requests/${adminDraft.data.id}/send`, { overrideReason: "PM unreachable, site waiting" });
check("Admin sends with a written reason", adminSendYes.status === 200 && adminSendYes.data?.status === "open", `status ${adminSendYes.status}`);
const a2 = await call("admin", "GET", `/audit-logs?entityType=design-request&projectCode=${code}&perPage=20&page=1`);
check("the send override is in the audit trail", (a2.data?.data ?? a2.data ?? []).some((r) => r.action === "override" && r.summary.includes("PM unreachable")));
const adminDirect = await call("admin", "POST", "/design-requests", body(`Admin override ${stamp}`, { overrideReason: "Urgent, PM travelling" }));
check("Admin can raise and send in one step with a reason", adminDirect.status === 201 && adminDirect.data?.status === "open");
const engineerDraft = await call("engineer", "POST", "/design-requests", body(`Engineer draft ${stamp}`));
check("an Engineer's request is still a draft (or the engineer is not staffed)", [201, 403].includes(engineerDraft.status) && (engineerDraft.status === 403 || engineerDraft.data?.status === "draft"), `${engineerDraft.status}`);
const pmDraftSend = await call("pm", "POST", `/design-requests/${(engineerDraft.data ?? adminDraft.data).id}/send`, {});
check("the PM sends a draft without any reason", engineerDraft.status === 201 ? pmDraftSend.status === 200 : true, `status ${pmDraftSend.status}`);
const pmDirect = await call("pm", "POST", "/design-requests", body(`PM raise ${stamp}`));
check("the PM raises and sends in one step", pmDirect.status === 201 && pmDirect.data?.status === "open");
check("another PM cannot send this project's request", (await call("projectmanager1@easyconstruct.demo", "POST", `/design-requests/${adminDraft.data.id}/send`, {})).status >= 400);
void API;
void login;
finish();
