// Change #2 - corrupted-file check. Run from apps/api/: node src/scripts/system-check/change-02-file-integrity.mjs
// Local disk mode only: it edits a stored file on disk to simulate damage.
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { API, call, check, finish, login } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const status = async (urls) => (await call("pm", "POST", "/uploads/integrity", { urls })).data ?? {};
const diskPath = (url) => join(process.cwd(), url.replace(/^\//, ""));
const download = async (who, url) =>
  fetch(`${API}/uploads/file?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${await login(who)}` } });

const cfg = await call("admin", "GET", "/uploads/config");
check("running in local disk mode", cfg.data?.mode === "disk", cfg.data?.mode);

// 1. base64 path
const b64 = await call("admin", "POST", "/uploads", { filename: `i-${stamp}.png`, contentType: "image/png", dataUrl: `data:image/png;base64,${PNG_B64}` });
check("base64 upload is fingerprinted as verified", (await status([b64.data.url]))[b64.data.url] === "verified");

// 2. streaming path
const fd = new FormData();
fd.append("file", new Blob([Buffer.from(PNG_B64, "base64")], { type: "image/png" }), `s-${stamp}.png`);
const streamed = await fetch(`${API}/uploads/stream`, { method: "POST", headers: { Authorization: `Bearer ${await login("admin")}` }, body: fd }).then((r) => r.json());
const streamUrl = streamed.data?.url;
check("streamed upload is fingerprinted as verified", !!streamUrl && (await status([streamUrl]))[streamUrl] === "verified", streamUrl);

// 3. documents multipart path
const projects = await call("admin", "GET", "/projects?limit=3");
const project = (projects.data?.items ?? projects.data)[0];
const fd2 = new FormData();
fd2.append("file", new Blob([Buffer.from(PNG_B64, "base64")], { type: "image/png" }), `d-${stamp}.png`);
fd2.append("project", project.code);
fd2.append("type", "Field Report");
fd2.append("title", `Integrity ${stamp}`);
const doc = await fetch(`${API}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${await login("admin")}` }, body: fd2 }).then((r) => r.json());
const docUrl = doc.data?.fileUrl;
check("document upload is fingerprinted as verified", !!docUrl && (await status([docUrl]))[docUrl] === "verified", docUrl);

check("a url we know nothing about is unverified (missing row)", (await status(["/uploads/generic/never-uploaded.png"]))["/uploads/generic/never-uploaded.png"] === "unverified");

// 4. clean file: download and check stay verified
const ok = await download("pm", docUrl);
await ok.arrayBuffer();
check("untouched file downloads", ok.status === 200);
const chk = await call("pm", "POST", "/uploads/verify", { url: docUrl });
check("Check file on an untouched file says verified", chk.data?.status === "verified" && chk.data?.hadFingerprint === true, JSON.stringify(chk.data));

// 5. damage the stored file (Check file path)
check("stored file found on disk", existsSync(diskPath(docUrl)), diskPath(docUrl));
appendFileSync(diskPath(docUrl), "tampered");
const chk2 = await call("pm", "POST", "/uploads/verify", { url: docUrl });
check("Check file detects the change", chk2.data?.status === "damaged", JSON.stringify(chk2.data));
check("badge status is now damaged", (await status([docUrl]))[docUrl] === "damaged");

// 6. damage another file and find it through a download
appendFileSync(diskPath(streamUrl), "tampered");
const dl = await download("pm", streamUrl);
await dl.arrayBuffer();
check("a damaged file still downloads (the client warns first)", dl.status === 200);
await new Promise((r) => setTimeout(r, 400));
check("the download flagged it damaged", (await status([streamUrl]))[streamUrl] === "damaged");

// 7. alerts
const audit = await call("admin", "GET", "/audit-logs?actions=integrity_failed&perPage=20&page=1");
const rows = audit.data?.data ?? audit.data ?? [];
check("a security audit entry was written for each damaged file", rows.filter((r) => r.action === "integrity_failed").length >= 2, `${rows.length} rows`);
const adminNotes = await call("admin", "GET", "/notifications");
const itNotes = await call("itdesigner", "GET", "/notifications");
const has = (res) => (res.data?.data ?? res.data ?? []).some((n) => /Damaged file detected/.test(n.title));
check("Admin was notified", has(adminNotes));
check("IT Designer was notified", has(itNotes));

// 8. an untouched file keeps verifying, and a PM who cannot see finance files is not blocked from normal ones
const again = await call("pm", "POST", "/uploads/verify", { url: b64.data.url });
check("an undamaged file still verifies", again.data?.status === "verified");
check("verify needs a url", (await call("pm", "POST", "/uploads/verify", {})).status === 400);
check("verify needs a login", (await call(null, "POST", "/uploads/verify", { url: docUrl })).status === 401);
check("integrity lookup caps the number of urls", (await call("pm", "POST", "/uploads/integrity", { urls: Array.from({ length: 300 }, (_, i) => `/u/${i}`) })).status === 400);
finish();
