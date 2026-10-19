// apps/api/src/scripts/demo-seed-requests.ts
//
// RFI / RFA + transmittal demo data on the seeded projects, created through
// the real API as the real accounts (so numbering, countersign, scoping and
// notifications all behave as in use):
//   DEMO-S4 (Construction): an answered RFI, an open RFI, an RFA that went
//     draft -> sent -> approved-as-noted -> returned document, an overdue RFI,
//     a draft nobody sent, a follow-up, and an issued + acknowledged transmittal
//   DEMO-S5 (Closeout): an open RFI — it shows the "no open RFI/RFA" closing block
// Idempotent: a request whose subject already exists on the project is skipped.
//
// Run with: npm run demo:seed-requests   (API running)
import "dotenv/config";
import pg from "pg";
import { api, BASE, openSession, raw, type Session } from "./demo-seed-lib.js";
import { uploadPdf } from "./demo-files.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const exists = async (code: string, subject: string) =>
  (await pool.query("SELECT id FROM design_requests WHERE project_code = $1 AND subject = $2", [code, subject])).rows[0]?.id as number | undefined;

async function main() {
  const s: Session = await openSession();
  const created: string[] = [];

  const file = (who: keyof Session, name: string, title: string, lines: string[]) => uploadPdf(BASE, s[who].token, name, title, lines);
  const ref = (f: Awaited<ReturnType<typeof file>>) => ({ url: f.url, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes });

  const make = async (
    who: keyof Session,
    code: string,
    body: Record<string, unknown>,
    attach?: { name: string; title: string; lines: string[] },
  ) => {
    const subject = String(body.subject);
    const have = await exists(code, subject);
    if (have) return { id: have, fresh: false };
    const files = attach ? [ref(await file(who, attach.name, attach.title, attach.lines))] : undefined;
    const res = await api<{ id: number; number: string }>("/design-requests", s[who].token, { method: "POST", body: { projectCode: code, ...body, files } });
    created.push(res.number);
    return { id: res.id, fresh: true, number: res.number };
  };

  // ── DEMO-S4 ──────────────────────────────────────────────────────────────
  const architect = s.architect.id;
  const consultant = s.consultant.id;

  const doors = await make("pm", "DEMO-S4", {
    kind: "RFI", discipline: "AR", sheetNumbers: "A-2c to A-2i", subject: "Fire rating of doors on grid B",
    sectionsReferenced: "Door schedule, Sheet A-2d", requestText: "The door schedule does not state the fire rating of the doors on grid B (stair and electrical room). Please confirm the rating so the supplier can be ordered.",
    assignedToUserId: architect,
  }, { name: "DEMO-S4-door-schedule-markup.pdf", title: "Door schedule markup", lines: ["Project: DEMO-S4", "Sheet A-2d: doors D-12 to D-15 on grid B", "Rating not stated on the schedule."] });
  if (doors.fresh) {
    await api(`/design-requests/${doors.id}/acknowledge`, s.architect.token, { method: "POST", body: {} });
    const answer = await file("architect", "AID-2d-1-door-ratings.pdf", "AID-2d-1 Door fire ratings", ["Doors D-12 to D-15: 1-hour rated, self-closing.", "Electrical room door D-15: 2-hour rated.", "Refer to revised sheet A-2d."]);
    await api(`/design-requests/${doors.id}/respond`, s.architect.token, { method: "POST", body: { responseText: "D-12 to D-14 are 1-hour rated, self-closing. The electrical room door D-15 is 2-hour rated. See attached AID-2d-1.", files: [ref(answer)] } });
    await raw(`/design-requests/${doors.id}/follow-up`, s.pm.token, { method: "POST", body: { requestText: "Please also confirm the fire-door seal and smoke-gasket type to be supplied with D-15." } });
  }

  await make("pm", "DEMO-S4", {
    kind: "RFI", discipline: "ST", sheetNumbers: "S-3a", subject: "Rebar splice length at column C-4",
    requestText: "Sheet S-3a shows 40d lap splices at column C-4 but the general notes say 50d. Please confirm which governs.",
    assignedToUserId: consultant, dueDays: 5,
  });

  // Engineer drafts an RFA, the PM countersigns and sends it, the consultant approves it as noted.
  const rfa = await make("engineer", "DEMO-S4", {
    kind: "RFA", discipline: "ST", sheetNumbers: "S-3a", subject: "Substitution of 16 mm rebar with 20 mm at column C-4",
    requestText: "Supplier shortage of 16 mm bars. Request approval to substitute 20 mm bars at the same spacing at column C-4 and C-5.",
    costImpact: "increase", costNote: "Subject for variation — about PHP 38,000", timeImpact: "none", assignedToUserId: consultant,
  }, { name: "DEMO-S4-rebar-substitution.pdf", title: "Rebar substitution request", lines: ["Column C-4 / C-5", "16 mm -> 20 mm, spacing unchanged", "Supplier letter attached on file."] });
  if (rfa.fresh) {
    await api(`/design-requests/${rfa.id}/send`, s.pm.token, { method: "POST", body: {} });
    await api(`/design-requests/${rfa.id}/respond`, s.consultant.token, { method: "POST", body: { outcome: "approved_as_noted", responseText: "Approved as noted: keep the lap length at 50d for the larger bar and submit the revised bar-bending schedule." } });
    await api(`/design-requests/${rfa.id}/returned`, s.pm.token, { method: "POST", body: { returnedByName: "Rico Domingo", returnedByPosition: "Site Clerk" } });
  }

  // An overdue RFI: sent three days ago with the default 3-day window.
  const od = await make("pm", "DEMO-S4", {
    kind: "RFI", discipline: "ME", sheetNumbers: "M-1b", subject: "Chiller room clearance below the beam",
    requestText: "The chiller plant needs 2.4 m clear below the transfer beam on grid 5, but the section shows 2.1 m. Please confirm the intended clearance.",
    assignedToUserId: architect,
  });
  if (od.fresh) await pool.query("UPDATE design_requests SET sent_at = now() - interval '6 days', created_at = now() - interval '6 days', countersigned_at = now() - interval '6 days', due_date = now() - interval '3 days' WHERE id = $1", [od.id]);

  // A draft the PM never sent.
  const dr = await make("engineer", "DEMO-S4", {
    kind: "RFA", discipline: "AR", subject: "Facade cladding sample approval",
    requestText: "Request approval of the aluminium composite panel sample in 'Slate Grey' for the podium facade.",
    assignedToUserId: architect,
  });
  if (dr.fresh) await pool.query("UPDATE design_requests SET created_at = now() - interval '4 days' WHERE id = $1", [dr.id]);

  // ── DEMO-S5 (Closeout): an open request that blocks closing ───────────────
  await make("pm", "DEMO-S5", {
    kind: "RFI", discipline: "AR", subject: "Final as-built dimensions of the plant room",
    requestText: "Please confirm the as-built dimensions of the refrigeration plant room for the turnover drawings; the field survey differs by 80 mm.",
    assignedToUserId: s.architect1.id,
  });

  // ── Transmittal on S4 ─────────────────────────────────────────────────────
  const tSubject = "Door and rebar clarifications for the client";
  const have = (await pool.query("SELECT id FROM transmittals WHERE project_code = 'DEMO-S4' AND subject = $1", [tSubject])).rows[0];
  if (!have) {
    const answered = await exists("DEMO-S4", "Fire rating of doors on grid B");
    const rebar = await exists("DEMO-S4", "Substitution of 16 mm rebar with 20 mm at column C-4");
    const nums = (await pool.query("SELECT id, number, subject FROM design_requests WHERE id = ANY($1)", [[answered, rebar].filter(Boolean)])).rows;
    const t = await api<{ id: number; controlNo: string }>("/transmittals", s.pm.token, {
      method: "POST",
      body: {
        projectCode: "DEMO-S4", toName: "Pasig Retail Ventures — Project Office", thruName: "Architect of record", type: "inter-agency", subject: tSubject,
        purposes: ["for-information", "for-approval", "plans-drawing"],
        items: nums.map((n: { id: number; number: string; subject: string }, i: number) => ({ requestId: n.id, particulars: `${n.number} — ${n.subject}`, remarks: i === 0 ? "1 set, A3" : "With supplier letter" })),
      },
    });
    await api(`/transmittals/${t.id}/issue`, s.pm.token, { method: "POST", body: {} });
    await api(`/transmittals/${t.id}/acknowledgements`, s.pm.token, { method: "POST", body: { name: "Maricel Dizon", office: "Client project office", signature: "M.D." } });
    created.push(t.controlNo);
  }

  // Let the overdue notifications go out now rather than at the next hourly tick.
  const sweep = await api<{ notified: number }>("/design-requests/sweep", s.admin.token, { method: "POST" });

  console.log(created.length ? `Created: ${created.join(", ")}` : "Nothing new to create (already seeded).");
  console.log(`Overdue notifications sent: ${sweep.notified}`);
}

main()
  .catch((e) => {
    console.error("\n✘ demo-seed-requests failed:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
