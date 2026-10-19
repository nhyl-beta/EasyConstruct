// Change #6 - RFI/RFA reply link (no login).
// Needs the SMTP sink (node src/scripts/system-check/smtp-sink.mjs system-check-out/mailbox.json) and the API started
// with MAIL_HOST=127.0.0.1 MAIL_PORT=2525. Run from apps/api/.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { API, call, check, finish, login } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const box = () => JSON.parse(readFileSync("system-check-out/mailbox.json", "utf8"));
const sql = (q) => execSync("docker exec -i ec-local-pg psql -U postgres -d easyconstruct_local -q -At", { input: q, encoding: "utf8" }).trim();
const tokenFor = (email) => {
  const mail = [...box()].reverse().find((m) => m.to.includes(email));
  const match = mail?.text.match(/\/reply\/([A-Za-z0-9_-]{43})/);
  return { token: match?.[1], mail };
};
const pub = (token, path = "", init) => fetch(`${API}/public/rfi-replies/${token}${path}`, init);
const form = (fields, files = []) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append("files", new Blob([f.bytes], { type: f.type }), f.name);
  return { method: "POST", body: fd };
};

const pmList = await call("pm", "GET", "/projects?limit=50");
const project = (pmList.data?.items ?? pmList.data ?? []).find((p) => !["Archived", "Completed", "Cancelled", "On Hold"].includes(p.status));
const code = project.code;
const mk = (name, email) => call("pm", "POST", "/stakeholders", { projectCode: code, name, company: `${name} Co`, role: "Other", email });
const alice = await mk(`Alice ${stamp}`, `alice.${stamp}@example.com`);
const bea = await mk(`Bea ${stamp}`, `bea.${stamp}@example.com`);
const cy = await mk(`Cy ${stamp}`, `cy.${stamp}@example.com`);

// A request with an attachment, sent to Alice and Bea.
const up = await call("pm", "POST", "/uploads", { filename: `plan-${stamp}.png`, contentType: "image/png", dataUrl: `data:image/png;base64,${PNG.toString("base64")}` });
const make = (subject, ids, files) =>
  call("pm", "POST", "/design-requests", {
    kind: "RFI",
    projectCode: code,
    discipline: "AR",
    subject,
    requestText: "Please confirm the ceiling height for the lobby on level 2.",
    recipientType: "client",
    recipientStakeholderIds: ids,
    files,
  });
const req1 = await make(`Reply link ${stamp}`, [alice.data.id, bea.data.id], [{ url: up.data.url, filename: `plan-${stamp}.png`, contentType: "image/png", sizeBytes: PNG.length }]);
check("PM sends an RFI with an attachment to two stakeholders", req1.status === 201, `status ${req1.status} ${req1.body?.message ?? ""}`);

const a = tokenFor(`alice.${stamp}@example.com`);
const b = tokenFor(`bea.${stamp}@example.com`);
check("each email carries a reply link with a 43-character token", !!a.token && !!b.token && a.token !== b.token);
check("the email has the Reply to this request link", /Reply to this request/.test(a.mail.text));
const hashRow = sql(`select count(*) from design_request_reply_tokens where token_hash like '%'`);
check("tokens are stored hashed, never as the token itself", sql(`select count(*) from design_request_reply_tokens where token_hash = '${a.token}'`) === "0" && Number(hashRow) >= 2);

// 1. Open without logging in.
const open = await pub(a.token);
const openBody = await open.json();
check("the link opens with no login", open.status === 200, `status ${open.status}`);
check("it shows project, number, subject, text, due date and attachments", !!openBody.data.projectName && openBody.data.requestNumber === req1.data.number && openBody.data.subject === `Reply link ${stamp}` && !!openBody.data.requestText && !!openBody.data.dueDate && openBody.data.attachments.length === 1);
check("it returns nothing internal (no assignee, requester, status, emails or other recipients)", !JSON.stringify(openBody).match(/requestedBy|assignedTo|alice\.|bea\.|status|recipients|@example/i), JSON.stringify(Object.keys(openBody.data)));
check("the company name is returned for the page header", !!openBody.data.companyName);

// 2. Attachments through the token only, and only this request's.
const fileId = openBody.data.attachments[0].id;
const dl = await pub(a.token, `/files/${fileId}`);
const bytes = Buffer.from(await dl.arrayBuffer());
check("an attachment downloads with the token", dl.status === 200 && bytes.equals(PNG), `status ${dl.status}`);
const other = await make(`Other request ${stamp}`, [cy.data.id], [{ url: up.data.url, filename: `other-${stamp}.png`, contentType: "image/png", sizeBytes: PNG.length }]);
const otherFileId = (await call("pm", "GET", `/design-requests/${other.data.id}`)).data.files[0].id;
check("a file of another request is not reachable with this token", (await pub(a.token, `/files/${otherFileId}`)).status === 404);
check("the download route needs a valid token", (await pub("x".repeat(43), `/files/${fileId}`)).status === 404);

// 3. Bad tokens.
const junk = await pub("not-a-token");
check("a malformed token gets a friendly refusal", junk.status === 404 && /not valid/i.test((await junk.json()).message));
check("an unknown token gets the same refusal", (await pub("A".repeat(43))).status === 404);

// 4. Submit, with validation first.
check("an empty answer is refused", (await pub(a.token, "", form({ answer: "", name: "Alice A", position: "Owner rep" }))).status === 400);
check("a missing name is refused", (await pub(a.token, "", form({ answer: "Ceiling is 3.0 m", name: "", position: "Owner rep" }))).status === 400);
check("a program renamed to .pdf is refused", (await pub(a.token, "", form({ answer: "See attached file", name: "Alice A", position: "Owner rep" }, [{ name: "evil.pdf", type: "application/pdf", bytes: Buffer.from("MZ\x90\x00 this is not a pdf") }]))).status === 400);
check("too many files are refused", (await pub(a.token, "", form({ answer: "See attached", name: "Alice A", position: "Owner rep" }, Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.png`, type: "image/png", bytes: PNG }))))).status === 400);

const submit = await pub(a.token, "", form({ answer: "The lobby ceiling is 3.0 m clear.", name: "Alice Anders", position: "Owner's representative" }, [{ name: "answer.png", type: "image/png", bytes: PNG }]));
check("the recipient answers from the link", submit.status === 201, `status ${submit.status} ${(await submit.clone().text()).slice(0, 120)}`);

const detail = (await call("pm", "GET", `/design-requests/${req1.data.id}`)).data;
const ra = detail.recipients.find((r) => r.name.startsWith("Alice"));
const rb = detail.recipients.find((r) => r.name.startsWith("Bea"));
check("the request becomes client_replied", detail.status === "client_replied", detail.status);
check("the answer is on the request with name and position", detail.responseText === "The lobby ceiling is 3.0 m clear." && detail.respondedByName === "Alice Anders" && detail.respondedByPosition === "Owner's representative");
check("Alice is marked replied with her own answer; Bea is not", !!ra.repliedAt && ra.responseText.includes("3.0 m") && !rb.repliedAt);
const respFiles = detail.files.filter((f) => f.stage === "response");
check("the attachment was saved with the response and linked to Alice", respFiles.length === 1 && respFiles[0].recipientId === ra.id && respFiles[0].filename === "answer.png");

// 5. Notifications and audit.
const pmNotes = await call("pm", "GET", "/notifications");
check("the PM was notified in-app", (pmNotes.data?.data ?? pmNotes.data ?? []).some((n) => n.title?.includes(`${req1.data.number}: Alice`)));
const audit = await call("admin", "GET", `/audit-logs?entityType=rfi-reply&perPage=50&page=1`);
const lines = audit.data?.data ?? audit.data ?? [];
check("an audit line exists for the open and for the submit", lines.some((r) => r.action === "opened" && r.summary.includes(req1.data.number)) && lines.some((r) => r.action === "submitted" && r.summary.includes(req1.data.number)));

// 6. Single use.
const again = await pub(a.token, "", form({ answer: "Second try", name: "Alice A", position: "Rep" }));
const againBody = await again.json();
check("the same link cannot answer twice", again.status === 410 && againBody.code === "REPLY_LINK_USED", `status ${again.status}`);
check("an opened-again used link shows a friendly message", (await pub(a.token)).status === 410);

// 7. Several recipients: Bea replies too and both answers are kept.
const bSubmit = await pub(b.token, "", form({ answer: "Ceiling is 3.2 m on the plan.", name: "Bea Bautista", position: "Contractor PM" }));
check("a second recipient can answer too", bSubmit.status === 201);
const detail2 = (await call("pm", "GET", `/design-requests/${req1.data.id}`)).data;
check("both answers are kept, one per recipient", detail2.recipients.filter((r) => r.repliedAt && r.responseText).length === 2);
check("the PM still has to close it (still client_replied)", detail2.status === "client_replied");
check("the PM can close it", (await call("pm", "POST", `/design-requests/${req1.data.id}/close`, {})).status === 200);

// 8. Expiry and closed requests.
const req2 = await make(`Expiry ${stamp}`, [cy.data.id]);
const c = tokenFor(`cy.${stamp}@example.com`);
check("a new request mailed a fresh link", !!c.token);
sql(`update design_request_reply_tokens set expires_at = now() - interval '1 day' where recipient_id in (select id from design_request_recipients where request_id = ${req2.data.id})`);
const expired = await pub(c.token);
check("an expired link shows a friendly message", expired.status === 410 && (await expired.json()).code === "REPLY_LINK_EXPIRED");

const req3 = await make(`Closed ${stamp}`, [cy.data.id]);
const closedToken = tokenFor(`cy.${stamp}@example.com`).token;
await call("pm", "POST", `/design-requests/${req3.data.id}/close`, {});
check("a closed request no longer takes an answer", (await pub(closedToken, "", form({ answer: "Too late really", name: "Cy C", position: "Rep" }))).status === 410);

// 9. Resend mints a new link.
const req4 = await make(`Resend ${stamp}`, [cy.data.id]);
const t1 = tokenFor(`cy.${stamp}@example.com`).token;
const rid = (await call("pm", "GET", `/design-requests/${req4.data.id}`)).data.recipients[0].id;
await call("pm", "POST", `/design-requests/${req4.data.id}/resend-email`, { recipientId: rid });
const t2 = tokenFor(`cy.${stamp}@example.com`).token;
check("a resend sends a fresh link (the earlier one also still works until used)", t1 !== t2 && (await pub(t1)).status === 200 && (await pub(t2)).status === 200);

// 10. Rate limit (last: it blocks this address for a few minutes on this API instance).
let limited = 0;
for (let i = 0; i < 12; i++) if ((await pub("A".repeat(43), "", form({ answer: "x", name: "y", position: "z" }))).status === 429) limited++;
check("repeated submissions from one address are rate limited", limited >= 1, `${limited} refused`);
finish();
