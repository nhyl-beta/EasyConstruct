import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-seed-design.ts
//
// One Design-delivery demo project (DEMO-D1, "Design only"): Proposal done,
// sitting in the Design phase with three plan sets at different stages, designs
// with real files, RFIs/RFAs (one answered, one approved-as-noted, one overdue)
// and a transmittal. Built through the real API as the demo accounts.
// Idempotent: a project that already exists at Design is left alone.
//
// Run with: npm run demo:seed-design   (API running)
import "dotenv/config";
import pg from "pg";
import { addDays, api, BASE, openSession, TODAY } from "./demo-seed-lib.js";
import { uploadPdf, uploadPng } from "./demo-files.js";

const CODE = "DEMO-D1";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const s = await openSession();
  const projects = await api<{ id: number; code: string; status: string }[]>("/projects", s.admin.token);
  const found = projects.find((p) => p.code === CODE);
  if (found && found.status === "Design") {
    console.log(`${CODE} already at Design (id ${found.id}) — left as is`);
    return;
  }
  if (found) {
    console.log(`${CODE} exists at ${found.status}; remove it first (npm run demo:reset) to rebuild.`);
    return;
  }

  const pm = s.pm;
  const created = await api<{ id: number }>("/projects", pm.token, {
    method: "POST",
    body: {
      name: "DEMO · D1 Design Only",
      code: CODE,
      pm: pm.name,
      plannedStartDate: TODAY,
      due: "2027-03-31",
      client: "Katipunan Medical Arts Corp.",
      projectType: "Commercial",
      location: "Quezon City, Metro Manila",
      description: "Medical arts building — architectural, structural and MEP plan sets for permit and bidding. No site works in this contract.",
      contractValue: 4_800_000,
      deliveryType: "Design",
      designDisciplines: ["Architectural", "Structural", "MEP"],
    },
  });
  await api(`/projects/${created.id}`, pm.token, { method: "PATCH", body: { plannedStartDate: "2026-08-03", due: "2026-12-18" } });
  console.log(`Created ${CODE} (id ${created.id}), Design delivery`);

  for (const [acc, role] of [[s.architect, "architect"], [s.consultant, "consultant"], [s.engineer, "engineer"]] as const) {
    await api("/project-members", pm.token, { method: "POST", body: { projectCode: CODE, userId: acc.id, userName: acc.name, role } });
  }

  // Proposal: submitted, approved by the Consultant then the PM; award documents on file.
  const pdf = (who: typeof s.architect, name: string, title: string, lines: string[]) => uploadPdf(BASE, who.token, name, title, lines);
  const sub = await api<{ proposal: { id: number }; workflow: { id: number; stages: { id: number; role: string }[] } }>("/proposals/submit", s.architect.token, {
    method: "POST",
    body: { proposalId: `PRP-${CODE}`, title: "Medical arts building — design proposal", projectCode: CODE, submittedBy: s.architect.name, amount: "4800000", content: "Plan sets for a five-storey medical arts building." },
  });
  const prop = await pdf(s.architect, `${CODE}-proposal.pdf`, "Design Proposal — Medical Arts Building", [`Project: ${CODE}`, "Architectural, structural and MEP plan sets.", "Contract: PHP 4,800,000"]);
  await api(`/workflows/${sub.workflow.id}/attachments`, s.architect.token, { method: "POST", body: { kind: "document", label: "Design proposal", fileUrl: prop.url, fileName: prop.filename, fileSize: `${Math.round(prop.sizeBytes / 1024)} KB` } });
  await api(`/workflows/${sub.workflow.id}/stages/${sub.workflow.stages.find((x) => x.role === "consultant")!.id}/decision`, s.consultant.token, { method: "PATCH", body: { decision: "approve" } });
  const wf = await api<{ stages: { id: number; role: string }[] }>(`/workflows/${sub.workflow.id}`, pm.token);
  await api(`/workflows/${sub.workflow.id}/stages/${wf.stages.find((x) => x.role === "project-manager")!.id}/decision`, pm.token, { method: "PATCH", body: { decision: "approve" } });
  for (const [i, type] of ["Notice of Award", "Contract"].entries()) {
    const f = await pdf(pm, `${CODE}-${type.replace(/\s+/g, "-")}.pdf`, type, [`Project: ${CODE}`, `Document: ${type}`]);
    await api("/documents", pm.token, { method: "POST", body: { documentId: `DD1-${i + 1}`, title: `${type} - Katipunan Medical Arts`, project: CODE, type, version: "1.0", size: `${Math.round(f.sizeBytes / 1024)} KB`, fileUrl: f.url, uploadedBy: pm.name } });
  }
  await api(`/projects/${created.id}/lifecycle/advance`, pm.token, { method: "POST", body: {} });

  // Plan sets exist now (one per chosen discipline).
  const sets = await api<{ id: number; discipline: string }[]>(`/deliverables?projectCode=${CODE}`, pm.token);
  const set = (d: string) => sets.find((x) => x.discipline === d)!;
  await api(`/deliverables/${set("Architectural").id}`, pm.token, { method: "PATCH", body: { leadUserId: s.architect.id, sheetRange: "A-101 to A-118", status: "for_review" } });
  await api(`/deliverables/${set("Structural").id}`, pm.token, { method: "PATCH", body: { leadUserId: s.architect.id, sheetRange: "S-201 to S-210", status: "in_progress" } });
  // MEP deliberately has no lead yet and has not started: DP1 stays pending.

  // Designs with real files for Architectural and Structural; the first is approved.
  const mkDesign = async (code: string, name: string, discipline: string, variant: number) => {
    const img = await uploadPng(BASE, s.architect.token, `${code}.png`, [CODE, name.toUpperCase(), discipline.toUpperCase(), "SHEET 01"], variant);
    const doc = await pdf(s.architect, `${code}.pdf`, name, [`Project: ${CODE}`, `Discipline: ${discipline}`]);
    return api<{ id: number }>("/designs", s.architect.token, {
      method: "POST",
      body: { code, name, projectCode: CODE, discipline, category: discipline, leadArchitect: s.architect.name, fileUrls: [{ name: img.filename, url: img.url }, { name: doc.filename, url: doc.url }] },
    });
  };
  const arch = await mkDesign("DSN-D1-ARCH", "Medical arts building — architectural plans", "Architectural", 0);
  await mkDesign("DSN-D1-STR", "Medical arts building — structural framing", "Structural", 1);
  const rv = await api<{ id: number }>("/design-reviews", s.consultant.token, { method: "POST", body: { code: "REV-D1-ARCH", designId: arch.id, requestedBy: s.architect.name } });
  await api(`/design-reviews/${rv.id}/decide`, s.consultant.token, { method: "POST", body: { decision: "Approved" } });
  await api("/blueprints", s.architect.token, { method: "POST", body: { drawingNumber: "BP-D1-A101", title: "Architectural drawing set — issue 1", folder: "Architectural", discipline: "Architectural", scale: "1:100", revision: "A", author: s.architect.name, approval: "Approved", status: "Current", fileType: "PDF", sizeKb: 220, projectCode: CODE, designId: arch.id } });

  // RFIs / RFAs.
  const answered = await api<{ id: number }>("/design-requests", pm.token, {
    method: "POST",
    body: { kind: "RFI", projectCode: CODE, discipline: "AR", sheetNumbers: "A-104", subject: "Clinic corridor width for stretcher access", requestText: "Please confirm the clear corridor width on level 2 meets stretcher turning requirements.", assignedToUserId: s.architect.id },
  });
  await api(`/design-requests/${answered.id}/respond`, s.architect.token, { method: "POST", body: { responseText: "Clear width is 2.4 m; stretcher turning circle verified on sheet A-104." } });
  const rfa = await api<{ id: number }>("/design-requests", s.engineer.token, {
    method: "POST",
    body: { kind: "RFA", projectCode: CODE, discipline: "ST", sheetNumbers: "S-203", subject: "Transfer beam depth at grid C", requestText: "Request approval to increase the transfer beam depth from 700 mm to 800 mm.", costImpact: "increase", costNote: "Subject for variation", timeImpact: "increase", timeDays: 2, assignedToUserId: s.consultant.id },
  });
  await api(`/design-requests/${rfa.id}/send`, pm.token, { method: "POST", body: {} });
  await api(`/design-requests/${rfa.id}/respond`, s.consultant.token, { method: "POST", body: { outcome: "approved_as_noted", responseText: "Approved as noted: keep the soffit level; revise the ceiling details." } });
  const overdue = await api<{ id: number }>("/design-requests", pm.token, {
    method: "POST",
    body: { kind: "RFI", projectCode: CODE, discipline: "ME", sheetNumbers: "M-101", subject: "Riser location for the chilled-water line", requestText: "The riser shown on M-101 clashes with the elevator pit. Please confirm the intended location.", assignedToUserId: s.architect.id },
  });
  await pool.query("UPDATE design_requests SET sent_at = now() - interval '7 days', created_at = now() - interval '7 days', countersigned_at = now() - interval '7 days', due_date = now() - interval '4 days' WHERE id = $1", [overdue.id]);

  const tr = await api<{ id: number }>("/transmittals", pm.token, {
    method: "POST",
    body: { projectCode: CODE, toName: "Katipunan Medical Arts Corp. — Project Office", type: "inter-agency", subject: "Architectural plan set — issue for client review", purposes: ["for-review", "plans-drawing"], items: [{ requestId: answered.id, particulars: "RFI — clinic corridor width", remarks: "Response attached" }, { particulars: "Architectural drawing set A-101 to A-118, issue 1", remarks: "2 sets" }] },
  });
  await api(`/transmittals/${tr.id}/issue`, pm.token, { method: "POST", body: {} });

  // Backdate the project's history so the story reads coherently.
  await pool.query("UPDATE projects SET created_at = $2 WHERE code = $1", [CODE, `${addDays(TODAY, -75)} 09:00`]);
  await pool.query("UPDATE project_phase_history SET created_at = $2 WHERE project_code = $1 AND to_status = 'Design'", [CODE, `${addDays(TODAY, -45)} 09:30`]);

  const sweep = await api<{ notified: number }>("/design-requests/sweep", s.admin.token, { method: "POST" });
  const view = await api<{ phase: string; progress: number; checks: { key: string; passed: boolean }[] }>(`/projects/${created.id}/lifecycle`, pm.token);
  console.log(`${CODE}: phase=${view.phase} progress=${view.progress}% gates ${view.checks.map((c) => `${c.key}:${c.passed ? "✓" : "✗"}`).join(" ")}; overdue notifications ${sweep.notified}`);
}

main()
  .catch((e) => {
    console.error("\n✘ demo-seed-design failed:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
