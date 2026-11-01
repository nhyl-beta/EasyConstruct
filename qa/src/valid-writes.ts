// Valid-payload write probes, one per write endpoint the access matrix covers. Each entry builds a FRESH fixture and returns a function
// that performs the write as a given role and answers the HTTP status, so one successful wrong-role write can never hide behind a
// consumed fixture. They write real rows: the callers run against the QA database only (and the write-probe wrapper restores it).
import { call, createProject, session } from "./api.js";
import { assertQaEnvironment } from "./guard.js";
import { api, createRfi, employeeIdOf, pdfBytes, plus, raw, staff, startWorkflow, uid, upload } from "./kit.js";

const TEAM: [string, string][] = [["Architect", "architect"], ["Consultant", "consultant"], ["Engineer", "engineer"], ["Site Personnel", "site-personnel"]];
const withProject = async (phase: "Proposal" | "Design" | "Construction" | "Closeout") => {
  const p = await createProject({ phase, creator: "Project Manager", name: `QA vw ${uid()}` });
  for (const [role, member] of TEAM) await staff(p, role, member);
  return p;
};
type Fixture = () => Promise<(role: string) => Promise<number>>;
const status = async (role: string, method: string, path: string, body?: unknown) => (await call(role, method, path, body)).status;

export const WRITE: Record<string, Fixture> = {
  "documents.upload": async () => {
    const p = await withProject("Construction"); const cfg = assertQaEnvironment();
    return async (role) => {
      const fd = new FormData();
      fd.set("file", new Blob([pdfBytes("probe")], { type: "application/pdf" }), "probe.pdf");
      for (const [k, v] of Object.entries({ documentId: `WP${uid()}`, title: "Write probe", project: p.code, type: "Contract", version: "1.0" })) fd.set(k, v);
      return (await fetch(`${cfg.apiUrl}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${(await session(role)).token}` }, body: fd })).status;
    };
  },
  "documents.json": async () => {
    const p = await withProject("Construction"); const f = await upload("Project Manager", "probe.pdf");
    return async (role) => status(role, "POST", "/documents", { documentId: `WP${uid()}`, title: "Write probe", project: p.code, type: "Contract", version: "1.0", size: "1 KB", fileUrl: f.url, uploadedBy: (await session(role)).name });
  },
  "blueprints": async () => {
    const p = await withProject("Design"); const arch = await session("Architect");
    const a = await upload("Architect", `${p.code}-a.png`, "png"), b = await upload("Architect", `${p.code}-b.pdf`);
    const d = await api<{ id: number }>("Architect", "POST", "/designs", { code: `DSN-${uid()}`, name: `${p.code} design`, projectCode: p.code, discipline: "Structural", category: "Structural", leadArchitect: arch.name, fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }] });
    return (role) => status(role, "POST", "/blueprints", { drawingNumber: `BP-${uid()}`, title: "Write probe", folder: "Structural", discipline: "Structural", scale: "1:100", revision: "A", author: arch.name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 1, projectCode: p.code, designId: d.id });
  },
  "proposals.submit": async () => {
    const p = await withProject("Proposal");
    return async (role) => status(role, "POST", "/proposals/submit", { proposalId: `PRP-${uid()}`, title: "Write probe", projectCode: p.code, submittedBy: (await session(role)).name, amount: "1000000", content: "Valid write probe payload." });
  },
  "design-requests.create": async () => {
    const p = await withProject("Construction");
    return async (role) => (await createRfi(p, role, "Architect")).status;
  },
  "attendance": async () => {
    const p = await withProject("Construction"); const emp = await employeeIdOf("Site Personnel"); const photo = await upload("Site Personnel", "probe.png", "png");
    return (role) => status(role, "POST", "/attendance", { employeeId: emp, site: "QA site", projectCode: p.code, clockIn: "08:00", latitude: 14.6, longitude: 121.0, photoUrl: photo.url, logDate: plus(-(20000 + Math.floor(Math.random() * 9000))) });
  },
  "workflows.closeout": async () => {
    const p = await withProject("Closeout");
    return async (role) => (await startWorkflow(role, "Project Closeout", p)).status;
  },
  "design-requests.send": async () => {
    const p = await withProject("Construction"); const draft = await createRfi(p, "Engineer", "Architect");
    if (!draft.ok) throw new Error(`draft RFI not created: ${draft.status}`);
    return (role) => status(role, "POST", `/design-requests/${draft.data.id}/send`, { dueDays: 3 });
  },
  "design-requests.respond": async () => {
    const p = await withProject("Construction"); const rfi = await createRfi(p, "Project Manager", "Architect");
    if (!rfi.ok) throw new Error(`RFI not created: ${rfi.status}`);
    return (role) => status(role, "POST", `/design-requests/${rfi.data.id}/respond`, { responseText: "Valid write probe answer." });
  },
  "milestones.complete": async () => {
    const p = await withProject("Construction");
    const m = await api<{ id: number }>("Project Manager", "POST", "/milestones", { projectCode: p.code, title: "Write probe", description: "QA", estimatedCompletionDate: plus(40) });
    await api("Project Manager", "PATCH", `/milestones/${m.id}`, { status: "active" });
    return (role) => status(role, "PATCH", `/milestones/${m.id}`, { status: "completed" });
  },
  "tasks.create": async () => {
    const p = await withProject("Construction"); const site = await session("Site Personnel");
    return (role) => status(role, "POST", "/tasks", { taskCode: `TSK-${uid()}`.slice(0, 20), projectCode: p.code, title: "Write probe task", description: "QA", priority: "Low", status: "Pending", progress: 0, dueDate: plus(20), assignedToUserId: site.userId, assignedToName: site.name });
  },
  "issues.create": async () => {
    const p = await withProject("Construction");
    return async (role) => status(role, "POST", "/issues", { issueCode: `ISS-${uid()}`.slice(0, 20), projectCode: p.code, category: "Quality", severity: "Low", title: "Write probe issue", description: "Valid write probe issue description.", reportedByName: (await session(role)).name });
  },
  "requirements.create": async () => {
    const p = await withProject("Construction"); const f = await upload("Engineer", "probe.pdf");
    return async (role) => status(role, "POST", "/requirements", { title: "Write probe requirement", project: p.code, category: "Materials", description: "Valid write probe requirement description.", attachments: [{ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes ?? 100 }], createdBy: (await session(role)).name });
  },
  "engineering-reports.create": async () => {
    const p = await withProject("Construction");
    return async (role) => status(role, "POST", "/engineering-reports", { title: "Write probe report", type: "Site Inspection", project: p.code, location: "QC", date: plus(0), engineer: (await session(role)).name, description: "Valid write probe report description.", findings: "Valid write probe findings text.", recommendations: "Valid write probe recommendations." });
  },
  "designs.create": async () => {
    const p = await withProject("Design"); const arch = await session("Architect");
    const a = await upload("Architect", `${p.code}-a.png`, "png"), b = await upload("Architect", `${p.code}-b.pdf`);
    return (role) => status(role, "POST", "/designs", { code: `DSN-${uid()}`, name: `${p.code} probe`, projectCode: p.code, discipline: "Structural", category: "Structural", leadArchitect: arch.name, fileUrls: [{ name: a.filename, url: a.url }, { name: b.filename, url: b.url }] });
  },
  "architect-documents.create": async () => {
    return async (role) => status(role, "POST", "/architect-documents", { title: "Write probe document", category: "Advisory", version: "1.0", owner: (await session(role)).name, fileType: "PDF", sizeKb: 1, status: "Draft" });
  },
  "payroll.submit": async () => {
    const id = await batch(false);
    return (role) => status(role, "POST", `/payroll/batches/${id}/submit`, {});
  },
  "payroll.decide": async () => {
    const id = await batch(true);
    return (role) => status(role, "POST", `/finance/payroll-review/${id}/decide`, { decision: "approved" });
  },
};
async function batch(submit: boolean) {
  const p = await withProject("Construction"); const emp = await employeeIdOf("Site Personnel");
  const r = await raw("Human Resources", "POST", "/payroll/generate", { period: `WP ${uid()}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 8 }], submit });
  if (!r.ok) throw new Error(`payroll batch not created: ${r.status} ${r.body?.message}`);
  return String(r.data.batch.id);
}
