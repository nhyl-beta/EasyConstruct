// Change #8 - overdue emails: ONE summary email per person per day. Local database and local SMTP sink only.
//
// Needs the sink (node scripts/ops/system-check/smtp-sink.mjs system-check-out/mailbox.json) and the API started with
// MAIL_HOST=127.0.0.1 MAIL_PORT=2525 and CRON_SECRET=check-cron-secret-0123456789.
//   Mode "default" (API started with MAIL_SKIP_DOMAINS=easyconstruct.demo):  node ... change-08-overdue-emails.mjs
//   Mode "empty"   (API started with an empty MAIL_SKIP_DOMAINS, e.g. a single space, so nothing extra is skipped): CHECK_SKIP=empty node ...
// Run from apps/api/.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { API, call, check, finish } from "./change-lib.mjs";

const MODE = process.env.CHECK_SKIP === "empty" ? "empty" : "default";
const SECRET = process.env.CRON_SECRET ?? "check-cron-secret-0123456789";
const stamp = Date.now().toString(36).slice(-5);
const sql = (q) => execSync("docker exec -i ec-local-pg psql -U postgres -d easyconstruct_local -q -At", { input: q, encoding: "utf8" }).trim();
const box = () => JSON.parse(readFileSync("system-check-out/mailbox.json", "utf8"));
const runCron = (secret = SECRET, method = "POST") =>
  fetch(`${API}/cron/overdue`, { method, headers: secret ? { Authorization: `Bearer ${secret}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const to = (m) => m.to.join(",");
const wipeSent = () => sql(`delete from overdue_reminders where channel = 'email'`);
const summariesFor = (address, since) => box().slice(since).filter((m) => to(m).includes(address) && /Subject: EasyConstruct: \d+ /.test(m.raw));

console.log(`mode: ${MODE}`);
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
check("vercel.json schedules /api/cron/overdue daily", vercel.crons.some((c) => c.path === "/api/cron/overdue" && /^\d+ \d+ \* \* \*$/.test(c.schedule)));
check("the cron needs the secret", [401, 403].includes((await runCron("")).status));
check("a wrong secret is refused", (await runCron("nope")).status === 401);

const ARCH_DEMO = "architect@easyconstruct.demo";
const ADMIN_DEMO = "admin@easyconstruct.demo";
// In "default" mode two people get real-looking addresses for the run (restored at the end); the demo accounts are never emailed.
const archAddr = MODE === "empty" ? ARCH_DEMO : `architect.${stamp}@checkmail.dev`;
const adminAddr = MODE === "empty" ? ADMIN_DEMO : `admin.${stamp}@checkmail.dev`;
if (MODE === "default") {
  sql(`update users set email = '${archAddr}' where email = '${ARCH_DEMO}'`);
  sql(`update users set email = '${adminAddr}' where email = '${ADMIN_DEMO}'`);
}
const restore = () => {
  if (MODE !== "default") return;
  sql(`update users set email = '${ARCH_DEMO}' where email like 'architect.%@checkmail.dev'`);
  sql(`update users set email = '${ADMIN_DEMO}' where email like 'admin.%@checkmail.dev'`);
};
const who = (address) => address; // call() signs in by address when it is not a known short name

try {
  const pmList = await call("pm", "GET", "/projects?limit=50");
  const construction = (pmList.data?.items ?? pmList.data).find((p) => p.status === "Construction");
  const members = await call("pm", "GET", `/design-requests/assignees?projectCode=${construction.code}`);
  const architect = members.data.find((m) => m.role === "architect") ?? members.data[0];
  const subjects = [1, 2, 3].map((n) => `Digest check ${stamp} #${n}`);
  const ids = [];
  for (const subject of subjects) {
    const created = await call("pm", "POST", "/design-requests", { kind: "RFI", projectCode: construction.code, discipline: "AR", subject, requestText: "Which door hardware set applies on level 3?", assignedToUserId: architect.userId });
    ids.push(created.data?.id);
    sql(`update design_requests set due_date = now() - interval '2 days' where id = ${created.data.id}`);
  }
  check("three overdue RFIs for one person", ids.length === 3 && ids.every(Boolean));
  // A fourth RFI that belongs to the Admin: it is listed in full in the Admin's email, not counted in the overview.
  const adminSubject = `Digest check ${stamp} admin-own`;
  const adminOwn = await call("pm", "POST", "/design-requests", { kind: "RFI", projectCode: construction.code, discipline: "AR", subject: adminSubject, requestText: "Which finish applies to the lobby?", assignedToUserId: architect.userId });
  const adminOwnId = adminOwn.data?.id;
  sql(`update design_requests set due_date = now() - interval '2 days', assigned_to_user_id = (select id from users where email = '${adminAddr}') where id = ${adminOwnId}`);
  const stage = sql(`select s.id from workflow_stages s join workflows w on w.id = s.workflow_id where w.status = 'active' and s.status = 'current' and s.role = 'finance-manager' limit 1`);
  sql(`update workflow_stages set updated_at = now() - interval '3 days' where id = ${stage}`);
  wipeSent();

  // Run 1.
  const before = box().length;
  const run1 = await runCron();
  const r1 = run1.body?.data?.result;
  check("the cron runs and returns the new result fields", run1.status === 200 && run1.body?.data?.ran === true && ["digestsSent", "digestsFailed", "itemsIncluded", "skippedUndeliverable"].every((k) => k in r1.emails), JSON.stringify(r1?.emails));
  const arch1 = summariesFor(archAddr, before);
  check("the architect gets exactly ONE email for three RFIs", arch1.length === 1, `${arch1.length}`);
  check("it lists all three with a link each", subjects.every((s) => arch1[0].text.includes(s)) && ids.every((id) => arch1[0].text.includes(`/requests?open=${id}`)));
  check("the subject counts the items", /Subject: EasyConstruct: \d+ overdue items need your attention/.test(arch1[0].raw));
  const admin1 = summariesFor(adminAddr, before);
  check("the Admin gets exactly ONE email", admin1.length === 1, `${admin1.length}`);
  const adminText = admin1[0]?.text ?? "";
  const lines = adminText.split("\n").filter((l) => l.startsWith("- ")).length;
  const everything = r1.requests.overdue + r1.stages.overdue + r1.reports.missing;
  check("the Admin's own RFI is listed in full under Your items, with its link", adminText.includes("Your items") && adminText.includes(adminSubject) && adminText.includes(`/requests?open=${adminOwnId}`));
  check("the architect's RFIs are NOT listed one by one for the Admin", subjects.every((s) => !adminText.includes(s)));
  check("the Admin email has the overview, linking to the dashboard", adminText.includes("Across all projects") && adminText.includes("/dashboard") && adminText.includes(construction.code) && adminText.includes("RFI/RFA overdue"));
  check("and far fewer lines than there are overdue items", everything > lines + 2 && lines <= 10 + 15, `${lines} lines for ${everything} overdue items`);
  const unfolded = admin1[0].raw.replace(/\r?\n[ \t]+/g, " ");
  check("the Admin subject counts both parts", /Subject: EasyConstruct: \d+ items? needs? your attention, \d+ overdue across \d+ projects?/.test(unfolded), unfolded.match(/Subject: .*/)?.[0]);
  check("the run reports the overview lines", r1.emails.adminOverviewProjects >= 1, JSON.stringify(r1.emails));
  const fresh = box().slice(before);
  const old = ids.length + 1 + (ids.length + 1); // one per item to its owner(s) and again to each Admin that can receive
  console.log(`  before this change about ${old}+ emails; now ${fresh.length} (${r1.emails.digestsSent} summaries, ${r1.emails.itemsIncluded} items)`);
  check("the run's counts match what the sink received", r1.emails.digestsSent === fresh.length && r1.emails.itemsIncluded >= 4, JSON.stringify(r1.emails));
  console.log("\n----- Admin summary as it arrived in the sink -----\n" + adminText + "\n----- Architect summary -----\n" + (arch1[0]?.text ?? "") + "\n-----");
  check("the in-app alerts still go out", (() => { const n = Number(sql(`select count(*) from notifications where role = 'admin' and title like 'Overdue%'`)); return n >= 1; })());

  if (MODE === "default") {
    check("no email went to a @easyconstruct.demo address", fresh.every((m) => !to(m).includes("@easyconstruct.demo")));
    check("those people are counted as skippedUndeliverable", r1.emails.skippedUndeliverable >= 1, `${r1.emails.skippedUndeliverable}`);
  } else {
    check("with MAIL_SKIP_DOMAINS empty a demo-domain user DOES get the summary", summariesFor(ARCH_DEMO, before).length === 1 && summariesFor(ADMIN_DEMO, before).length === 1 && r1.emails.skippedUndeliverable === 0, `${r1.emails.skippedUndeliverable} undeliverable`);
  }

  // Run 2 the same day.
  const mid = box().length;
  const run2 = await runCron();
  check("a second run the same day sends nothing", box().length === mid && run2.body?.data?.result?.emails?.digestsSent === 0, JSON.stringify(run2.body?.data?.result?.emails));
  check("and reports the items as already sent", run2.body?.data?.result?.emails?.skippedAlreadySent >= 1);

  if (MODE === "default") {
    // A refused send records nothing; the next run sends the whole summary.
    wipeSent();
    const archId = sql(`select id from users where email = '${archAddr}'`);
    sql(`update users set email = 'architect.reject.${stamp}@checkmail.dev' where id = ${archId}`);
    const failRun = await runCron();
    check("a refused send is counted as failed", failRun.body?.data?.result?.emails?.digestsFailed >= 1, JSON.stringify(failRun.body?.data?.result?.emails));
    check("and nothing is recorded for that person", sql(`select count(*) from overdue_reminders where recipient_user_id = ${archId} and channel = 'email'`) === "0");
    sql(`update users set email = '${archAddr}' where id = ${archId}`);
    const retryFrom = box().length;
    await runCron();
    const retry = summariesFor(archAddr, retryFrom);
    check("the next run sends the full summary once", retry.length === 1 && subjects.every((s) => retry[0].text.includes(s)));
    check("and records every item plus the person's summary row", Number(sql(`select count(*) from overdue_reminders where recipient_user_id = ${archId} and channel = 'email'`)) >= 4 && sql(`select count(*) from overdue_reminders where recipient_user_id = ${archId} and item_type = 'digest'`) === "1");

    // The per-user setting.
    check("Admin switches reminders off", (await call(who(adminAddr), "PATCH", "/me/settings", { emailOverdueReminders: false })).data?.emailOverdueReminders === false);
    wipeSent();
    const before4 = box().length;
    const run4 = await runCron();
    check("with the setting off the Admin gets no email, but the architect still does", summariesFor(adminAddr, before4).length === 0 && summariesFor(archAddr, before4).length === 1 && run4.body?.data?.result?.emails?.skippedOptOut >= 1);
    check("the Admin's in-app alerts are still there", Number(sql(`select count(*) from notifications where role = 'admin' and title like 'Overdue%'`)) >= 1);
    await call(who(adminAddr), "PATCH", "/me/settings", { emailOverdueReminders: true });
  }
} finally {
  restore();
}
finish();
