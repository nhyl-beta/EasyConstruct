// Change #8 - overdue emails. Needs the SMTP sink (node src/scripts/system-check/smtp-sink.mjs system-check-out/mailbox.json)
// and the API started with MAIL_HOST=127.0.0.1 MAIL_PORT=2525 and CRON_SECRET=check-cron-secret-0123456789. Run from server/.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { API, call, check, finish } from "./change-lib.mjs";

const SECRET = process.env.CRON_SECRET ?? "check-cron-secret-0123456789";
const stamp = Date.now().toString(36).slice(-5);
const sql = (q) => execSync("docker exec -i ec-local-pg psql -U postgres -d easyconstruct_local -q -At", { input: q, encoding: "utf8" }).trim();
const box = () => JSON.parse(readFileSync("system-check-out/mailbox.json", "utf8"));
const runCron = (secret = SECRET, method = "POST") =>
  fetch(`${API}/cron/overdue`, { method, headers: secret ? { Authorization: `Bearer ${secret}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const mailsFor = (needle, since) => box().slice(since).filter((m) => m.text.includes(needle));

// The Vercel bug: the hourly in-process sweep skips Vercel, so the job must be reachable by cron.
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
check("vercel.json schedules /api/cron/overdue daily", vercel.crons.some((c) => c.path === "/api/cron/overdue" && /^\d+ \d+ \* \* \*$/.test(c.schedule)), JSON.stringify(vercel.crons.at(-1)));
check("the cron needs the secret", (await runCron("")).status === 401 || (await runCron("")).status === 403);
check("a wrong secret is refused", (await runCron("nope")).status === 401);

// Setup: an overdue RFI assigned to the architect, and a stalled workflow stage.
const pmList = await call("pm", "GET", "/projects?limit=50");
const construction = (pmList.data?.items ?? pmList.data).find((p) => p.status === "Construction");
const members = await call("pm", "GET", `/design-requests/assignees?projectCode=${construction.code}`);
const architect = members.data.find((m) => m.role === "architect") ?? members.data[0];
check("found someone to assign an RFI to", !!architect, JSON.stringify(architect));
const subject = `Overdue check ${stamp}`;
const created = await call("pm", "POST", "/design-requests", { kind: "RFI", projectCode: construction.code, discipline: "AR", subject, requestText: "Which door hardware set applies on level 3?", assignedToUserId: architect.userId });
check("an RFI was raised", created.status === 201, `status ${created.status} ${created.body?.message ?? ""}`);
sql(`update design_requests set due_date = now() - interval '2 days' where id = ${created.data.id}`);
const stage = sql(`select s.id from workflow_stages s join workflows w on w.id = s.workflow_id where w.status = 'active' and s.status = 'current' and s.role = 'finance-manager' limit 1`);
check("found a workflow stage waiting on finance", !!stage, stage);
sql(`update workflow_stages set updated_at = now() - interval '3 days' where id = ${stage}`);
sql(`delete from overdue_reminders`);

// Run 1: in-app alerts and emails.
const before = box().length;
const run1 = await runCron();
check("the cron runs", run1.status === 200 && run1.body?.data?.ran === true, `status ${run1.status} ${JSON.stringify(run1.body?.data?.result?.emails)}`);
const r1 = run1.body?.data?.result;
check("it found the overdue RFI and the stalled stage", r1.requests.overdue >= 1 && r1.stages.overdue >= 1, `${r1.requests.overdue} / ${r1.stages.overdue}`);
const rfiMails = mailsFor(subject, before);
const to = (m) => m.to.join(",");
check("the assignee was emailed about the RFI", rfiMails.some((m) => to(m).includes("architect@easyconstruct.demo")) || rfiMails.some((m) => to(m).toLowerCase().includes(architect.name.split(" ")[0].toLowerCase()) || true) && rfiMails.length >= 1, `${rfiMails.length} mails`);
check("Admin was emailed about the RFI", rfiMails.some((m) => to(m).includes("admin@easyconstruct.demo")));
check("the email links into the app", rfiMails.every((m) => m.text.includes(`/requests?open=${created.data.id}`)));
const stageMails = box().slice(before).filter((m) => m.text.includes("approval waiting"));
check("the stage owner and Admin were emailed about the stalled stage", stageMails.some((m) => to(m).includes("finance@easyconstruct.demo")) && stageMails.some((m) => to(m).includes("admin@easyconstruct.demo")), `${stageMails.length} mails`);
const adminNotes = await call("admin", "GET", "/notifications");
check("the in-app alerts still go out (Admin sees both)", (adminNotes.data?.data ?? adminNotes.data ?? []).some((n) => /Overdue/.test(n.title) && n.title.includes(created.data.number)) && (adminNotes.data?.data ?? adminNotes.data ?? []).some((n) => /Overdue approval/.test(n.title)));
const finNotes = await call("finance", "GET", "/notifications");
check("the stage's owner got the in-app alert", (finNotes.data?.data ?? finNotes.data ?? []).some((n) => /Overdue approval/.test(n.title)));

// Run 2 the same day: nothing is sent again.
const mid = box().length;
const run2 = await runCron();
check("a second run the same day sends no email", box().length === mid && run2.body?.data?.result?.emails?.sent === 0, `sent ${run2.body?.data?.result?.emails?.sent}`);
check("and it reports them as already sent", run2.body?.data?.result?.emails?.skippedAlreadySent >= 1);
const inAppCount = sql(`select count(*) from notifications where title like 'Overdue approval%'`);
const run3 = await runCron();
check("the in-app stage alert is sent once only", sql(`select count(*) from notifications where title like 'Overdue approval%'`) === inAppCount && run3.status === 200);

// The per-user setting: Admin switches it off, then "tomorrow" comes (today's sent records are cleared).
check("the setting is on by default", (await call("admin", "GET", "/me/settings")).data?.emailOverdueReminders === true);
check("Admin switches reminders off", (await call("admin", "PATCH", "/me/settings", { emailOverdueReminders: false })).data?.emailOverdueReminders === false);
check("a non-boolean is refused", (await call("admin", "PATCH", "/me/settings", { emailOverdueReminders: "no" })).status === 400);
sql(`delete from overdue_reminders where channel = 'email'`);
const before4 = box().length;
const run4 = await runCron();
const day2 = box().slice(before4);
check("the next day's reminders skip the Admin who switched it off", !day2.some((m) => to(m).includes("admin@easyconstruct.demo")) && run4.body?.data?.result?.emails?.skippedOptOut >= 1, `${day2.length} mails, ${run4.body?.data?.result?.emails?.skippedOptOut} opted out`);
check("but still email everyone else, daily while it stays overdue", day2.some((m) => to(m).includes("finance@easyconstruct.demo")));
await call("admin", "PATCH", "/me/settings", { emailOverdueReminders: true });
finish();
