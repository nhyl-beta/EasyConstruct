// Helpers for lifecycle tests: thin wrappers over the real API so each gate can be built with the same calls the UI makes.
import { call, callOk, createProject, session, type ApiResult, type CreateProjectOptions, type QaProject } from "./api.js";
import { assertQaEnvironment } from "./guard.js";
import { expect, test } from "@playwright/test";

export { createProject, type QaProject };
export const PM = "Project Manager", ADMIN = "Admin", ARCH = "Architect", CONS = "Consultant", ENG = "Engineer", SITE = "Site Personnel",
  FIN = "Finance Manager", HR = "Human Resources", OWNER = "Owner", IT = "IT Designer";

export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
export const plus = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
let seq = 0;
export const uid = () => `${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`.toUpperCase();

export async function api<T = any>(role: string, method: string, path: string, body?: unknown): Promise<T> {
  return (await callOk(role, method, path, body)).data as T;
}
export const raw = (role: string | null, method: string, path: string, body?: unknown): Promise<ApiResult> => call(role, method, path, body);

export interface Check { key: string; passed: boolean; label: string; detail?: string; ownerRoles: string[]; link?: string }
export interface View { phase: string; progress: number; band?: { start: number; end: number }; canAdvance: boolean; nextPhase: string | null; checks: Check[]; blockedReason?: string; history: any[]; phasePath?: string[]; planSets?: any[]; deliveryType: string }
export const view = (p: { id: number }, role = PM) => api<View>(role, "GET", `/projects/${p.id}/lifecycle`);
export const gateState = (v: View, key: string) => v.checks.find((c) => c.key === key);
export const failing = (v: View) => v.checks.filter((c) => !c.passed).map((c) => c.key);

/** Advance must be refused with 409 listing the failing checks. Returns the failing keys the response names. */
export async function expectBlocked(p: { id: number }, role = PM): Promise<string[]> {
  const r = await raw(role, "POST", `/projects/${p.id}/lifecycle/advance`, {});
  expect(r.status, `Advance should be blocked with 409, got ${r.status}: ${r.body?.message ?? ""}`).toBe(409);
  expect(r.body?.code, "409 body should carry code GATE_BLOCKED").toBe("GATE_BLOCKED");
  const checks: Check[] = r.body?.failing ?? [];
  return (Array.isArray(checks) ? checks : []).filter((c) => c && c.passed === false).map((c) => c.key);
}
export async function advance(p: { id: number }, role = PM, body: Record<string, unknown> = {}) {
  const r = await raw(role, "POST", `/projects/${p.id}/lifecycle/advance`, body);
  expect(r.ok, `Advance failed: ${r.status} ${r.body?.message ?? ""}`).toBe(true);
  return r;
}

export async function staff(p: QaProject, roleLabel: string, memberRole: string) {
  const s = await session(roleLabel);
  return api(PM, "POST", "/project-members", { projectCode: p.code, userId: s.userId, userName: s.name, role: memberRole });
}

// ── files ────────────────────────────────────────────────────────────────────────────────────────
const pdfBytes = (title: string) => {
  const stream = `BT /F1 16 Tf 50 740 Td (${title.replace(/[()\\]/g, "-")}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const off: number[] = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
};
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==", "base64");

export interface Stored { url: string; filename: string; contentType: string; sizeBytes?: number }
export async function upload(role: string, name: string, kind: "pdf" | "png" = "pdf"): Promise<Stored> {
  const bytes = kind === "pdf" ? pdfBytes(name) : PNG_1x1;
  const type = kind === "pdf" ? "application/pdf" : "image/png";
  return api<Stored>(role, "POST", "/uploads", { filename: name, contentType: type, dataUrl: `data:${type};base64,${bytes.toString("base64")}` });
}
/** A project document of a given type (Notice of Award, Contract, Notice to Proceed, ...). */
export async function addDoc(role: string, p: QaProject, type: string, extra: Record<string, unknown> = {}) {
  const f = await upload(role, `${p.code}-${type.replace(/\W+/g, "-")}.pdf`);
  const s = await session(role);
  return api(role, "POST", "/documents", { documentId: `${p.code}-${uid()}`, title: `${type} - ${p.code}`, project: p.code, type, version: "1.0", size: "1 KB", fileUrl: f.url, uploadedBy: s.name, ...extra });
}

export async function proposalWorkflow(p: QaProject): Promise<number> {
  const arch = await session(ARCH);
  const r = await api<{ workflow: { id: number } }>(ARCH, "POST", "/proposals/submit", { proposalId: `PRP-${p.code}`, title: `${p.code} proposal`, projectCode: p.code, submittedBy: arch.name, amount: "1000000", content: "QA design proposal." });
  const f = await upload(ARCH, `${p.code}-proposal.pdf`);
  await api(ARCH, "POST", `/workflows/${r.workflow.id}/attachments`, { kind: "document", label: "Proposal", fileUrl: f.url, fileName: f.filename, fileSize: "1 KB" });
  return r.workflow.id;
}
/** Approve the current stage of a workflow as the role that owns it. Returns the API result so tests can inspect refusals. */
export async function decide(wfId: number, stageRole: string, actorRole: string, decision: "approve" | "reject" = "approve", comments = "QA") {
  const w = await api<{ stages: { id: number; role: string; status: string }[] }>(PM, "GET", `/workflows/${wfId}`);
  const st = w.stages.find((x) => x.role === stageRole && x.status === "current");
  if (!st) return { status: 0 as number, ok: false, body: { message: `no current ${stageRole} stage: ${w.stages.map((x) => `${x.role}:${x.status}`).join(",")}` }, data: null } as ApiResult;
  return raw(actorRole, "PATCH", `/workflows/${wfId}/stages/${st.id}/decision`, { decision, comments });
}
export async function startWorkflow(role: string, templateName: string, p: QaProject, extra: Record<string, unknown> = {}) {
  const tpl = (await api<{ id: number; name: string }[]>(role, "GET", "/workflows/templates")).find((t) => t.name === templateName);
  if (!tpl) throw new Error(`workflow template '${templateName}' not found`);
  return raw(role, "POST", "/workflows", { title: `${templateName} - ${p.code}`, projectCode: p.code, templateId: tpl.id, ...extra });
}

// ── step helper: every CSV step is a test.step titled "LC-100 step 3 ..."; a failed step does not stop later steps ──
export function steps(caseId: string) {
  const failures: string[] = [];
  const run = async (n: number, title: string, fn: () => Promise<void>) => {
    try { await test.step(`${caseId} step ${n} ${title}`, fn); }
    catch (e) { failures.push(`step ${n}: ${(e as Error).message.split("\n")[0]}`); }
  };
  return { run, done: () => { if (failures.length) throw new Error(`${failures.length} step(s) failed: ${failures.join(" | ")}`); } };
}

export const cfg = () => assertQaEnvironment();
export { expect, test };
