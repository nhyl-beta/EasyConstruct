import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/verify-phase2-requests.ts
//
// Live API proof for RFI/RFA + transmittals + deadlines + the closing block.
// Creates throwaway rows (subject starts with "VERIFY") and removes them again.
// Needs the API running. Run: npx tsx scripts/demo/verify-phase2-requests.ts
import "dotenv/config";
import pg from "pg";
import { login, raw, EMAILS, api } from "./demo-seed-lib.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
let failed = 0;
const out: Record<string, unknown>[] = [];
const rec = (name: string, got: unknown, expected: unknown) => {
  const ok = String(got) === String(expected);
  if (!ok) failed += 1;
  out.push({ check: name, got, expected, result: ok ? "PASS" : "FAIL" });
};
const days = (iso: string, from: Date) => Math.round((new Date(iso).getTime() - from.getTime()) / 86_400_000);

async function main() {
  const [admin, pm, pm1, eng, eng1, arch, arch1, cons] = await Promise.all([
    login(EMAILS.admin), login(EMAILS.pm), login(EMAILS.pm1), login(EMAILS.engineer), login(EMAILS.engineer1),
    login(EMAILS.architect), login(EMAILS.architect1), login(EMAILS.consultant),
  ]);
  const users = await api<{ id: number; email: string }[]>("/users", admin);
  const uid = (e: string) => users.find((u) => u.email === e)!.id;

  // 1. PM raises an RFI to the architect
  const t0 = new Date();
  const rfi = await raw("/design-requests", pm, {
    method: "POST",
    body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "AR", sheetNumbers: "A-2c to A-2i", subject: "VERIFY door schedule clarification", requestText: "Please confirm the fire rating of the doors on grid B.", costImpact: "none", timeImpact: "none", assignedToUserId: uid(EMAILS.architect) },
  });
  rec("PM raises RFI -> 201", rfi.status, 201);
  const r1 = rfi.data;
  rec("number format RFI-DEMO-S4-AR-nnn-YY", /^RFI-DEMO-S4-AR-\d{3}-\d{2}$/.test(r1?.number), true);
  rec("PM's own request is auto-countersigned and open", `${r1?.status}/${r1?.countersignedByName}`, "open/Miguel Santos");
  rec("RFI default deadline is 3 days", days(r1.dueDate, t0), 3);
  const rfi2 = await raw("/design-requests", pm, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "AR", subject: "VERIFY second RFI", requestText: "Second request for the sequence check.", assignedToUserId: uid(EMAILS.architect), dueDays: 7 } });
  rec("sequence increments per project+kind+discipline", Number(rfi2.data.sequence) - Number(r1.sequence), 1);
  rec("custom window is honoured (7 days)", days(rfi2.data.dueDate, new Date()), 7);

  // 2. Engineer drafts an RFA; PM sends it
  const rfa = await raw("/design-requests", eng, {
    method: "POST",
    body: { kind: "RFA", projectCode: "DEMO-S4", discipline: "ST", subject: "VERIFY rebar substitution", requestText: "Request approval to substitute 16 mm bars with 20 mm at column C-4.", costImpact: "increase", costNote: "Subject for variation", timeImpact: "none", assignedToUserId: uid(EMAILS.consultant) },
  });
  rec("Engineer's RFA starts as a draft with no deadline", `${rfa.data?.status}/${rfa.data?.dueDate}`, "draft/null");
  rec("Engineer cannot send their own draft -> 403", (await raw(`/design-requests/${rfa.data.id}/send`, eng, { method: "POST", body: {} })).status, 403);
  const t1 = new Date();
  const sent = await raw(`/design-requests/${rfa.data.id}/send`, pm, { method: "POST", body: {} });
  rec("PM sends (countersigns) -> open", `${sent.status}/${sent.data?.status}/${sent.data?.countersignedByName}`, "200/open/Miguel Santos");
  rec("RFA default deadline is 4 days", days(sent.data.dueDate, t1), 4);
  rec("cost impact flags a change-order suggestion", sent.data?.suggestsChangeOrder, true);

  // 3. Permissions
  rec("architect cannot raise -> 403", (await raw("/design-requests", arch, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "AR", subject: "VERIFY nope", requestText: "Should be refused outright.", assignedToUserId: uid(EMAILS.architect) } })).status, 403);
  rec("assignee must be a staffed Architect/Consultant (PM as assignee -> 400)", (await raw("/design-requests", pm, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "AR", subject: "VERIFY bad assignee", requestText: "Assignee is not a designer.", assignedToUserId: uid(EMAILS.engineer) } })).status, 400);
  rec("an unstaffed architect (architect1 on S4) cannot be assigned -> 400", (await raw("/design-requests", pm, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "AR", subject: "VERIFY unstaffed", requestText: "architect1 is not on this project.", assignedToUserId: uid(EMAILS.architect1) } })).status, 400);
  rec("only the assignee responds: consultant on the architect's RFI -> 403", (await raw(`/design-requests/${r1.id}/respond`, cons, { method: "POST", body: { responseText: "Not mine to answer." } })).status, 403);
  rec("engineer cannot respond -> 403", (await raw(`/design-requests/${r1.id}/respond`, eng, { method: "POST", body: { responseText: "Not allowed." } })).status, 403);

  // 4. Scoping
  rec("engineer1 (not staffed on S4) cannot open the request -> 403", (await raw(`/design-requests/${r1.id}`, eng1)).status, 403);
  rec("pm1 (another PM) cannot open it -> 403", (await raw(`/design-requests/${r1.id}`, pm1)).status, 403);
  const e1List = (await raw("/design-requests", eng1)).data ?? [];
  rec("engineer1's list does not include S4 requests", e1List.some((x: any) => x.projectCode === "DEMO-S4"), false);
  rec("admin sees it", (await raw(`/design-requests/${r1.id}`, admin)).status, 200);

  // 5. Responses
  const noOutcome = await raw(`/design-requests/${rfa.data.id}/respond`, cons, { method: "POST", body: { responseText: "Looks acceptable." } });
  rec("RFA response without an outcome -> 400", noOutcome.status, 400);
  const ack = await raw(`/design-requests/${r1.id}/acknowledge`, arch, { method: "POST", body: {} });
  rec("assignee acknowledges -> in_review", ack.data?.status, "in_review");
  const ans = await raw(`/design-requests/${r1.id}/respond`, arch, { method: "POST", body: { responseText: "Doors on grid B are 1-hour rated per sheet A-2d." } });
  rec("assignee answers the RFI -> answered", ans.data?.status, "answered");
  const dec = await raw(`/design-requests/${rfa.data.id}/respond`, cons, { method: "POST", body: { responseText: "Approved as noted: keep the 150 mm lap lengths.", outcome: "approved_as_noted" } });
  rec("consultant decides the RFA -> approved_as_noted", dec.data?.status, "approved_as_noted");
  rec("answered request is no longer overdue/open", `${ans.data?.isOpen}/${ans.data?.isOverdue}`, "false/false");
  const returned = await raw(`/design-requests/${rfa.data.id}/returned`, pm, { method: "POST", body: { returnedByName: "Rico Domingo", returnedByPosition: "Site Clerk" } });
  rec("returned-document block recorded on a decided RFA", returned.data?.returnedByName, "Rico Domingo");
  const fu = await raw(`/design-requests/${r1.id}/follow-up`, pm, { method: "POST", body: { requestText: "Please also confirm the rating of the fire door seals." } });
  rec("follow-up on an answered request -> 201 linked to the original", `${fu.status}/${fu.data?.followUpOfId === r1.id}`, "201/true");

  // 6. Overdue sweep notifies assignee + admin once
  const od = await raw("/design-requests", pm, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S4", discipline: "ME", subject: "VERIFY overdue case", requestText: "This one will be pushed past its due date.", assignedToUserId: uid(EMAILS.architect) } });
  await q(`UPDATE design_requests SET due_date = now() - interval '2 days' WHERE id = $1`, [od.data.id]);
  const att = await raw("/design-requests/attention", admin);
  rec("Needs-attention list shows the overdue request", (att.data?.overdueRequests ?? []).some((x: any) => x.id === od.data.id), true);
  const s1 = await raw("/design-requests/sweep", admin, { method: "POST" });
  const notifs = await q(`SELECT recipient_user_id, role FROM notifications WHERE title LIKE $1`, [`%${od.data.number}%`]);
  rec("first sweep notifies (assignee + admin)", `${s1.data?.notified >= 1}/${notifs.some((n) => n.recipient_user_id === uid(EMAILS.architect))}/${notifs.some((n) => n.role === "admin")}`, "true/true/true");
  const s2 = await raw("/design-requests/sweep", admin, { method: "POST" });
  rec("second sweep sends nothing new (once per request)", s2.data?.notified, 0);
  rec("sweep is admin-only: PM -> 403", (await raw("/design-requests/sweep", pm, { method: "POST" })).status, 403);
  rec("needs-attention is admin/owner/IT only: PM -> 403", (await raw("/design-requests/attention", pm)).status, 403);

  // 7. Closing block (S5 is in Closeout; PM is pm@, designers architect1/consultant1)
  const s5 = (await api<{ id: number; code: string }[]>("/projects", admin)).find((p) => p.code === "DEMO-S5")!;
  const before = await api<any>(`/projects/${s5.id}/lifecycle`, pm);
  rec("S5 has an X5 check and it passes with no open request", before.checks.find((c: any) => c.key === "X5")?.passed, true);
  const blocker = await raw("/design-requests", pm, { method: "POST", body: { kind: "RFI", projectCode: "DEMO-S5", discipline: "AR", subject: "VERIFY closing blocker", requestText: "Open request that must block closing.", assignedToUserId: uid(EMAILS.architect1) } });
  rec("PM raises an RFI on S5 (architect1 staffed there) -> 201", blocker.status, 201);
  const during = await api<any>(`/projects/${s5.id}/lifecycle`, pm);
  const x5 = during.checks.find((c: any) => c.key === "X5");
  rec("X5 fails while the RFI is open", x5?.passed, false);
  rec("the gate names the blocking request", String(x5?.detail).includes(blocker.data.number), true);
  rec("canAdvance is false", during.canAdvance, false);
  await raw(`/design-requests/${blocker.data.id}/close`, pm, { method: "POST", body: {} });
  const after = await api<any>(`/projects/${s5.id}/lifecycle`, pm);
  rec("X5 passes once the request is closed", after.checks.find((c: any) => c.key === "X5")?.passed, true);

  // 8. Transmittal
  const tr = await raw("/transmittals", pm, {
    method: "POST",
    body: { projectCode: "DEMO-S4", toName: "Pasig Retail Ventures", thruName: "Architect of record", type: "inter-agency", subject: "VERIFY request documents", purposes: ["for-review", "plans-drawing"], items: [{ requestId: r1.id, particulars: `${r1.number} — door schedule`, remarks: "1 set" }] },
  });
  rec("transmittal created -> 201", tr.status, 201);
  rec("control no format DEMO-S4-DOC-nn-YY", /^DEMO-S4-DOC-\d{2}-\d{2}$/.test(tr.data?.controlNo), true);
  rec("issue transmittal", (await raw(`/transmittals/${tr.data.id}/issue`, pm, { method: "POST", body: {} })).data?.status, "issued");
  const ackT = await raw(`/transmittals/${tr.data.id}/acknowledgements`, pm, { method: "POST", body: { name: "A. Cruz", office: "Records", signature: "AC" } });
  rec("receipt logged -> acknowledged", ackT.data?.status, "acknowledged");
  rec("item pointing at another project's request is refused -> 400", (await raw("/transmittals", pm, { method: "POST", body: { projectCode: "DEMO-S5", toName: "Client", subject: "VERIFY wrong project", items: [{ requestId: r1.id, particulars: "x" }] } })).status, 400);
  rec("engineer1 cannot read the S4 transmittal -> 403", (await raw(`/transmittals/${tr.data.id}`, eng1)).status, 403);

  // cleanup
  await q(`DELETE FROM transmittals WHERE subject LIKE 'VERIFY%'`);
  await q(`DELETE FROM design_requests WHERE subject LIKE 'VERIFY%' OR subject LIKE 'Follow-up: VERIFY%'`);
  await q(`DELETE FROM notifications WHERE title LIKE '%VERIFY%' OR message LIKE '%VERIFY%' OR title LIKE 'RFI-DEMO-S%' OR title LIKE 'RFA-DEMO-S%' OR title LIKE 'Overdue%RFI-DEMO%' OR title LIKE 'Overdue request RFI-DEMO%'`);

  console.table(out);
  console.log(failed === 0 ? "ALL PHASE 2 API CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
