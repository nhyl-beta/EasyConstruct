// Change #10 - PM daily, weekly and monthly reports. Needs the SMTP sink and the API started as for change #8
// (CRON_SECRET and the mail settings). Run from server/.
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

// The reminders.
sql(`delete from overdue_reminders where item_type = 'report'`);
const before = box().length;
const run1 = await runCron();
const r1 = run1.data?.result;
check("the cron found missing reports", run1.data?.ran === true && r1.reports.missing >= 1, JSON.stringify(r1?.reports));
const notes = await call("pm", "GET", "/notifications");
const mine = (notes.data?.data ?? notes.data ?? []).filter((n) => n.title?.includes(`${code}: Daily Report missing`));
check("the PM got an in-app reminder for yesterday's daily report", mine.length === 1, `${mine.length}`);
const mails = box().slice(before).filter((m) => m.text.includes(`${code}: Daily Report missing`) || m.text.includes("Daily Report has been filed") || m.text.includes("No Daily Report"));
check("and an email, since the PM's setting is on", mails.some((m) => m.to.includes("pm@easyconstruct.demo")), `${mails.length} mails`);
check("the email goes to the PM only", mails.every((m) => m.to.every((t) => !t.includes("admin@") && !t.includes("finance@"))));

const mid = box().length;
await runCron();
const notes2 = await call("pm", "GET", "/notifications");
check("a second run does not repeat the reminder or the email", (notes2.data?.data ?? notes2.data ?? []).filter((n) => n.title?.includes(`${code}: Daily Report missing`)).length === 1 && box().length === mid);

// Filing the report stops the reminder; the setting turns the email off.
await mkDoc("Daily Report", { reportPeriod: "daily", periodDate: yesterday });
sql(`delete from overdue_reminders where item_type = 'report'`);
const run3 = await runCron();
const notes3 = await call("pm", "GET", "/notifications");
check("once yesterday's daily report is filed there is no new daily reminder", (notes3.data?.data ?? notes3.data ?? []).filter((n) => n.title?.includes(`${code}: Daily Report missing`)).length === 1, JSON.stringify(run3.data?.result?.reports));
await call("pm", "PATCH", "/me/settings", { emailOverdueReminders: false });
sql(`delete from overdue_reminders where item_type = 'report'`);
const before4 = box().length;
await runCron();
const pmMails = box().slice(before4).filter((m) => m.to.includes("pm@easyconstruct.demo") && /Report/.test(m.text));
check("with the email setting off the PM gets the in-app reminder but no email", pmMails.length === 0 && (await call("pm", "GET", "/notifications")).data !== undefined, `${pmMails.length} mails`);
await call("pm", "PATCH", "/me/settings", { emailOverdueReminders: true });

// A Design project owes only weekly and monthly.
const design = list.find((p) => p.deliveryType === "Design" && p.status === "Design");
if (design) {
  const d = await call("admin", "GET", `/documents/report-status?project=${design.code}`);
  check("a Design project owes weekly and monthly only", JSON.stringify(d.data?.applicable) === JSON.stringify(["weekly", "monthly"]) && d.data.grids.daily.length === 0, JSON.stringify(d.data?.applicable));
}
finish();
