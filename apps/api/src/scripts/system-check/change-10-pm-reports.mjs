// Change #10 - PM daily, weekly and monthly reports. Needs the SMTP sink and the API started as for change #8
// (CRON_SECRET and the mail settings). Run from apps/api/.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { API, call, check, finish } from "./change-lib.mjs";

const SECRET = process.env.CRON_SECRET ?? "check-cron-secret-0123456789";
const stamp = Date.now().toString(36).slice(-5);
const sql = (q) => execSync("docker exec -i ec-local-pg psql -U postgres -d easyconstruct_local -q -At", { input: q, encoding: "utf8" }).trim();
const box = () => JSON.parse(readFileSync("system-check-out/mailbox.json", "utf8"));
const manila = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const addDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const today = manila();
const yesterday = addDays(today, -1);
const runCron = () => fetch(`${API}/cron/overdue`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());

const projects = await call("admin", "GET", "/projects?limit=50");
const list = projects.data?.items ?? projects.data;
const project = list.find((p) => p.status === "Construction");
const code = project.code;
check("found a project under construction", !!code, code);
// Active for a good while, so there are periods to be missing.
sql(`delete from project_phase_history where project_code = '${code}' and to_status = 'Construction'`);
sql(`insert into project_phase_history (project_code, from_status, to_status, changed_by, created_at) values ('${code}', 'Pre-Construction', 'Construction', 'check', now() - interval '120 days')`);

// Start clean so the check can be run again: no reports filed for this project yet.
sql(`delete from documents where project = '${code}' and report_period is not null`);

// Document types and filing.
const types = await call("pm", "GET", "/reference/document-types");
check("Daily, Weekly and Monthly Report types exist in the Reports category", ["Daily Report", "Weekly Report", "Monthly Report"].every((n) => types.data.some((t) => t.name === n && t.category === "Reports" && t.isSystem)));
const rename = await call("admin", "PATCH", `/reference/document-types/${types.data.find((t) => t.name === "Daily Report").id}`, { name: "Day Report" });
check("they cannot be renamed (the check reads them by name)", rename.status === 409);

const mkDoc = (type, extra) => call("pm", "POST", "/documents", { documentId: `R${stamp}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20), title: `${type} ${stamp}`, project: code, type, uploadedBy: "check", fileUrl: "/uploads/documents/x.pdf", ...extra });
check("a type with a mismatched period is refused", (await mkDoc("Daily Report", { reportPeriod: "weekly", periodDate: yesterday })).status === 400);
check("a period on an ordinary document is refused", (await mkDoc("Field Report", { reportPeriod: "daily", periodDate: yesterday })).status === 400);
check("a report for a future date is refused", (await mkDoc("Daily Report", { reportPeriod: "daily", periodDate: addDays(today, 3) })).status === 400);
const weekly = await mkDoc("Weekly Report", { reportPeriod: "weekly", periodDate: addDays(today, -10) });
check("a weekly report is stored against the Monday of its week", weekly.status === 201 && new Date(`${weekly.data.periodDate}T00:00:00Z`).getUTCDay() === 1, `${weekly.status} ${weekly.data?.periodDate}`);
const monthly = await mkDoc("Monthly Report", { reportPeriod: "monthly", periodDate: addDays(today, -40) });
check("a monthly report is stored against the 1st of its month", monthly.status === 201 && monthly.data.periodDate.endsWith("-01"), monthly.data?.periodDate);

// The grid.
const status1 = await call("pm", "GET", `/documents/report-status?project=${code}`);
const g = status1.data;
check("the project owes daily, weekly and monthly reports", JSON.stringify(g.applicable) === JSON.stringify(["daily", "weekly", "monthly"]));
check("the daily grid is newest first and yesterday is missing", g.grids.daily[0]?.start === yesterday && g.grids.daily[0]?.submitted === false, JSON.stringify(g.grids.daily[0]));
check("the filed weekly and monthly reports show as submitted", g.grids.weekly.some((c) => c.submitted) && g.grids.monthly.some((c) => c.submitted));
check("older weeks with nothing filed are missing", g.grids.weekly.some((c) => !c.submitted));
check("another role that cannot see the project is refused", (await call("site", "GET", `/documents/report-status?project=NOPE`)).status >= 400);

// The reminders. The PM is emailed ONE summary a day; a missing period is mentioned once. This check needs the API started
// with a skip list that lets the demo PM address through (MAIL_SKIP_DOMAINS=none.invalid).
const countNotes = async () => ((await call("pm", "GET", "/notifications")).data?.data ?? (await call("pm", "GET", "/notifications")).data ?? []).filter((n) => n.title?.includes(`${code}: Daily Report missing`)).length;
const wipe = () => sql(`delete from overdue_reminders where item_type in ('report','digest')`);
const pmSummaries = (since) => box().slice(since).filter((m) => m.to.includes("pm@easyconstruct.demo") && /EasyConstruct: \d+ overdue/.test(m.raw));
const notes0 = await countNotes();
wipe();
const before = box().length;
const run1 = await runCron();
const r1 = run1.data?.result;
check("the cron found missing reports and the result has the new fields", run1.data?.ran === true && r1.reports.missing >= 1 && "digestsSent" in r1.emails, JSON.stringify(r1?.reports));
check("the PM got an in-app reminder for yesterday's daily report", (await countNotes()) === notes0 + 1);
const m1 = pmSummaries(before);
check("the PM got exactly ONE summary email, not one per missing report", m1.length === 1, `${m1.length}`);
check("it has a Missing reports section with the daily, weekly and monthly lines", /Missing reports \(\d+\)/.test(m1[0].text) && m1[0].text.includes("Daily Report missing") && m1[0].text.includes("Weekly Report missing") && m1[0].text.includes("Monthly Report missing"));
check("the line says the missing period and does not repeat the project code", m1[0].text.includes(`missing for ${yesterday}`) && !m1[0].text.includes(`${code} · ${code}`));
check("the email goes to the PM only", box().slice(before).every((m) => m.to.every((t) => !t.includes("admin@") && !t.includes("finance@") || !/Missing reports/.test(m.text))));

// Same day again: nothing.
const mid = box().length;
await runCron();
check("a second run the same day sends no email and no second reminder", box().length === mid && (await countNotes()) === notes0 + 1);

// "Next day": the per-person row for today is gone, the periods already emailed are still recorded.
sql(`delete from overdue_reminders where item_type = 'digest'`);
const before2 = box().length;
await runCron();
console.log("   daily in-app notices after next-day run:", (await countNotes()) - notes0);
check("the next day the same periods are NOT emailed again", pmSummaries(before2).every((m) => !/Missing reports/.test(m.text)), `${pmSummaries(before2).length} summaries`);

// A period with no sent record is emailed: forget only the weekly one.
sql(`delete from overdue_reminders where item_type = 'report' and item_id % 4 = 1`);
sql(`delete from overdue_reminders where item_type = 'digest'`);
const before3 = box().length;
await runCron();
console.log("   daily in-app notices after weekly-forget run:", (await countNotes()) - notes0);
const m3 = pmSummaries(before3);
check("a period that has no sent record is emailed, and only that one", m3.length === 1 && m3[0].text.includes("Weekly Report missing") && !m3[0].text.includes("Daily Report missing") && !m3[0].text.includes("Monthly Report missing"));

// Filing the report stops the reminder; the setting turns the email off.
const filed = await mkDoc("Daily Report", { reportPeriod: "daily", periodDate: yesterday });
check("yesterday's daily report was filed", filed.status === 201, `status ${filed.status} ${filed.body?.message ?? ""} ${filed.data?.periodDate}`);
wipe();
const before4 = box().length;
const run4 = await runCron();
check("once yesterday's daily report is filed it is not listed again", pmSummaries(before4).every((m) => !m.text.includes(`${code} · Daily Report missing`)) && (await countNotes()) === notes0 + 1, JSON.stringify(run4.data?.result?.reports));
await call("pm", "PATCH", "/me/settings", { emailOverdueReminders: false });
wipe();
const before5 = box().length;
const run5 = await runCron();
check("with the email setting off the PM gets no email", pmSummaries(before5).length === 0 && run5.data?.result?.emails?.skippedOptOut >= 1);
check("but the in-app reminders were still created today", Number(sql(`select count(*) from notifications where title like '${code}: % Report missing'`)) >= 1);
await call("pm", "PATCH", "/me/settings", { emailOverdueReminders: true });

// A Design project owes only weekly and monthly.
const design = list.find((p) => p.deliveryType === "Design" && p.status === "Design");
if (design) {
  const d = await call("admin", "GET", `/documents/report-status?project=${design.code}`);
  check("a Design project owes weekly and monthly only", JSON.stringify(d.data?.applicable) === JSON.stringify(["weekly", "monthly"]) && d.data.grids.daily.length === 0, JSON.stringify(d.data?.applicable));
}
finish();
