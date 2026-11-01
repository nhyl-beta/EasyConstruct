// LC-180 Hold / Resume / Cancel rules; LC-181 write lock in Archived, Cancelled, On Hold. Reference: lifecycle.md section 2.
import { createProject, fastForward, api, raw, view, staff, upload, createRfi, employeeIdOf, steps, expect, test,
  PM, ADMIN, ARCH, ENG, SITE, HR, uid, today, plus, type QaProject } from "../../src/kit.js";
import { session } from "../../src/api.js";

test("LC-180 Hold, Resume and Cancel rules", async () => {
  const S = steps("LC-180");
  const design = await createProject({ phase: "Design", creator: PM, name: `QA hold ${uid()}` });
  const proposal = await createProject({ creator: PM, name: `QA cancel ${uid()}` });
  const late = await createProject({ phase: "Design", creator: PM, name: `QA cancel2 ${uid()}` });
  const hold = (p: QaProject, role: string, reason?: string) => raw(role, "POST", `/projects/${p.id}/lifecycle/hold`, reason === undefined ? {} : { reason });
  await S.run(1, "Hold a Design project without a reason -> blocked", async () => {
    const r = await hold(design, PM);
    expect(r.ok, `hold without a reason was accepted (${r.status})`).toBe(false);
    expect((await view(design)).phase).toBe("Design");
  });
  await S.run(2, "Hold with a reason -> On Hold; previous phase saved", async () => {
    const r = await hold(design, PM, "QA hold reason");
    expect(r.ok, `hold: ${r.status} ${r.body?.message}`).toBe(true);
    const proj = await api<any>(PM, "GET", `/projects/${design.id}`);
    expect(proj.status).toBe("On Hold");
    expect(JSON.stringify(proj), "no record of the previous phase on the project").toMatch(/Design/);
  });
  await S.run(3, "Hold on a Proposal or Closeout project -> blocked", async () => {
    const closeout = await createProject({ phase: "Closeout", creator: PM, name: `QA holdc ${uid()}` });
    expect((await hold(proposal, PM, "QA reason")).ok, "Proposal project could be held").toBe(false);
    expect((await hold(closeout, PM, "QA reason")).ok, "Closeout project could be held").toBe(false);
  });
  await S.run(4, "Resume -> back to the previous phase", async () => {
    const r = await raw(PM, "POST", `/projects/${design.id}/lifecycle/resume`, {});
    expect(r.ok, `resume: ${r.status} ${r.body?.message}`).toBe(true);
    expect((await view(design)).phase).toBe("Design");
  });
  await S.run(5, "Cancel at Proposal with a reason -> Cancelled; progress frozen", async () => {
    const before = (await view(proposal)).progress;
    const r = await raw(PM, "POST", `/projects/${proposal.id}/lifecycle/cancel`, { reason: "QA bid lost" });
    expect(r.ok, `cancel: ${r.status} ${r.body?.message}`).toBe(true);
    const v = await view(proposal);
    expect(v.phase).toBe("Cancelled"); expect(v.progress, "progress changed on cancel").toBe(before);
  });
  await S.run(6, "PM cancelling after Proposal -> blocked (Admin only)", async () => {
    expect((await raw(PM, "POST", `/projects/${late.id}/lifecycle/cancel`, { reason: "QA reason here" })).status).toBe(403);
  });
  await S.run(7, "Admin cancels after Proposal with a reason -> Cancelled", async () => {
    const r = await raw(ADMIN, "POST", `/projects/${late.id}/lifecycle/cancel`, { reason: "QA cancel reason" });
    expect(r.ok, `cancel: ${r.status} ${r.body?.message}`).toBe(true);
    expect((await view(late, ADMIN)).phase).toBe("Cancelled");
  });
  S.done();
});

test("LC-181 Write lock in Archived, Cancelled and On Hold", async () => {
  const S = steps("LC-181");
  // Staff the team while the project is still writable, then move it into each locked status.
  const lockedProjects: { label: string; p: QaProject }[] = [];
  for (const target of ["Archived", "Cancelled", "On Hold"] as const) {
    const p = await createProject({ creator: PM, name: `QA lock ${target} ${uid()}` });
    await staff(p, ENG, "engineer"); await staff(p, SITE, "site-personnel"); await staff(p, ARCH, "architect");
    await fastForward(p.id, target);
    lockedProjects.push({ label: target, p });
  }
  const site = await session(SITE);
  const sweep = async (title: string, role: string, calls: (p: QaProject) => [string, string, unknown][]) => {
    const bad: string[] = [];
    for (const { label, p } of lockedProjects) for (const [name, path, body] of calls(p)) {
      const r = await raw(role, "POST", path, body);
      if (r.status !== 409) bad.push(`${label}: ${name} -> ${r.status} ${String(r.body?.message ?? "").slice(0, 60)}`);
    }
    expect(bad, `${title}: expected 409 everywhere. ${bad.join("; ")}`).toEqual([]);
  };
  await S.run(1, "PM creates a task in each locked project -> 409", () => sweep("task", PM, (p) => [["task", "/tasks", { taskCode: `TSK-${p.code}`, projectCode: p.code, title: "QA", description: "QA", priority: "Low", status: "Pending", progress: 0, dueDate: plus(10), assignedToUserId: site.userId, assignedToName: site.name }]]));
  await S.run(2, "Engineer creates an issue, report, requirement and RFI in each -> 409", async () => {
    const att = await upload(ENG, "req.pdf");
    await sweep("engineer writes", ENG, (p) => [
    ["issue", "/issues", { issueCode: `ISS-${p.code}`, projectCode: p.code, category: "Quality", severity: "Low", title: "QA", description: "QA locked project issue", reportedByName: "Paolo Mendoza" }],
    ["report", "/engineering-reports", { title: "QA report", type: "Site Inspection", project: p.code, location: "QC", date: today(), engineer: "Paolo Mendoza", description: "QA locked project report description", findings: "QA locked project findings text", recommendations: "QA locked project recommendations" }],
    ["requirement", "/requirements", { title: "QA requirement", project: p.code, category: "Materials", description: "QA locked project requirement", attachments: [{ url: att.url, filename: att.filename, contentType: att.contentType, sizeBytes: att.sizeBytes ?? 100 }], createdBy: "Paolo Mendoza" }],
    ["rfi", "/design-requests", { kind: "RFI", projectCode: p.code, discipline: "AR", subject: "QA RFI", requestText: "QA locked project request", assignedToUserId: site.userId, dueDays: 3 }],
    ]);
  });
  await S.run(3, "PM uploads a document in each -> 409", async () => {
    const f = await upload(PM, "lock.pdf");
    await sweep("document", PM, (p) => [["document", "/documents", { documentId: `${p.code}-D`, title: "QA doc", project: p.code, type: "Contract", version: "1.0", size: "1 KB", fileUrl: f.url, uploadedBy: "Miguel Santos" }]]);
  });
  await S.run(4, "HR submits payroll for a locked project -> 409", async () => {
    const emp = await employeeIdOf(SITE);
    await sweep("payroll", HR, (p) => [["payroll", "/payroll/generate", { period: `Lock ${p.code}`, projectCode: p.code, entries: [{ employeeId: emp, hoursWorked: 8 }], submit: true }]]);
  });
  S.done();
});
