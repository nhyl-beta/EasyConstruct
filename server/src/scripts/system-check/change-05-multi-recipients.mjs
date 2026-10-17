// Change #5 - send one RFI/RFA to several stakeholders.
// Needs the SMTP sink (node src/scripts/system-check/smtp-sink.mjs system-check-out/mailbox.json) and the API
// started with MAIL_HOST=127.0.0.1 MAIL_PORT=2525. Run from server/.
import { readFileSync } from "node:fs";
import { call, check, finish } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const box = () => JSON.parse(readFileSync("system-check-out/mailbox.json", "utf8"));
const before = box().length;

const pmList = await call("pm", "GET", "/projects?limit=50");
const project = (pmList.data?.items ?? pmList.data ?? []).find((p) => !["Archived", "Completed", "Cancelled", "On Hold"].includes(p.status));
const code = project.code;
check("PM has a writable project", !!code, `${code} ${project.status}`);

const mk = (name, email) => call("pm", "POST", "/stakeholders", { projectCode: code, name, company: `${name} Co`, role: "Other", email });
const a = await mk(`Alice ${stamp}`, `alice.${stamp}@example.com`);
const b = await mk(`Bob ${stamp}`, `bob.reject.${stamp}@example.com`); // the sink refuses addresses containing "reject"
const c = await mk(`Cara ${stamp}`, `cara.${stamp}@example.com`);
check("three stakeholders exist", [a, b, c].every((r) => r.status === 201));

const body = (extra) => ({
  kind: "RFI",
  projectCode: code,
  discipline: "AR",
  subject: `Multi recipient ${stamp}`,
  requestText: "Which finish applies to the lobby wall on level 2?",
  recipientType: "client",
  ...extra,
});

check("a client request with nobody chosen is refused", (await call("pm", "POST", "/design-requests", body({}))).status === 400);
check("a stakeholder of another project cannot be chosen", (await call("pm", "POST", "/design-requests", body({ recipientStakeholderIds: [999999] }))).status === 400);

const created = await call("pm", "POST", "/design-requests", body({ recipientStakeholderIds: [a.data.id, b.data.id, c.data.id] }));
check("PM sends one RFI to three stakeholders", created.status === 201, `status ${created.status} ${created.body?.message ?? ""}`);
const id = created.data.id;

const detail = await call("pm", "GET", `/design-requests/${id}`);
const recips = detail.data?.recipients ?? [];
check("the request lists three recipients", recips.length === 3, `${recips.length}`);
const byName = (n) => recips.find((r) => r.name.startsWith(n));
check("Alice's copy was sent", byName("Alice")?.emailStatus === "sent");
check("Bob's copy failed without stopping the others (partial failure)", byName("Bob")?.emailStatus === "failed");
check("Cara's copy was sent", byName("Cara")?.emailStatus === "sent");
check("the old single-recipient columns follow the first recipient", detail.data?.recipientEmail === `alice.${stamp}@example.com` && detail.data?.emailStatus === "sent", `${detail.data?.recipientEmail} ${detail.data?.emailStatus}`);
const delivered = box().slice(before).filter((m) => m.to.some((x) => x.includes(`${stamp}@example.com`)));
check("two emails reached the stakeholders, one per working recipient (Bob's only reached the sender in Cc)", delivered.length === 2, `${delivered.length}`);
check("each copy is addressed to one stakeholder (plus the sender in Cc)", delivered.every((m) => m.to.filter((x) => x.includes(`${stamp}@example.com`)).length === 1));

const bobId = byName("Bob").id;
const caraId = byName("Cara").id;
const resendBob = await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: bobId });
const afterBob = (await call("pm", "GET", `/design-requests/${id}`)).data.recipients;
check("resending to Bob alone works and counts", resendBob.status === 200 && afterBob.find((r) => r.id === bobId).resendCount === 1, `status ${resendBob.status}`);
check("resending to Bob did not touch Cara", afterBob.find((r) => r.id === caraId).resendCount === 0);

await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: caraId });
await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: caraId });
await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: caraId });
const fourth = await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: caraId });
check("a recipient can be re-emailed at most three times", fourth.status === 409, `status ${fourth.status}`);
check("an unknown recipient id is a 404", (await call("pm", "POST", `/design-requests/${id}/resend-email`, { recipientId: 999999 })).status === 404);

// Someone who is not the sender or PM sees names but never the addresses.
const adminView = await call("admin", "GET", `/design-requests/${id}`);
check("Admin sees the recipients' addresses", adminView.data?.recipients?.every((r) => !!r.email));

// The older single-address form still works.
const legacy = await call("pm", "POST", "/design-requests", body({ subject: `Legacy ${stamp}`, recipientEmail: `legacy.${stamp}@example.com` }));
check("the older single-email form still creates one recipient", legacy.status === 201 && (await call("pm", "GET", `/design-requests/${legacy.data.id}`)).data.recipients.length === 1);
finish();
