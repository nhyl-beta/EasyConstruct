// server/src/scripts/system-check/files.ts
//
// File-handling check: for every role, upload a real PNG and a real PDF, read each back through
// the authenticated download route and compare bytes (sha256); then the negative cases
// (blocked type, oversize, malformed data URL, path traversal, no token) and the cross-role
// question "can a role read a file attached to another role's record?".
// Run: SMOKE_BASE_URL=http://localhost:8123/api npx tsx src/scripts/system-check/files.ts <outDir>
import "dotenv/config";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { assertDemoApi, assertNoRealBlobStore, failIfLoginsFailed } from "../demo-guard.js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8123/api";
assertDemoApi(BASE);
const outDir = process.argv[2] ?? ".";
const PASSWORD = "Demo@12345";
const ACCOUNTS: Record<string, string> = {
  owner: process.env.OWNER_EMAIL ?? "nhylcyrusgervasio@gmail.com",
  admin: "admin@easyconstruct.demo", "it-designer": "itdesigner@easyconstruct.demo", "project-manager": "pm@easyconstruct.demo",
  hr: "hr@easyconstruct.demo", finance: "finance@easyconstruct.demo", architect: "architect@easyconstruct.demo",
  engineer: "engineer@easyconstruct.demo", site: "site@easyconstruct.demo", consultant: "consultant@easyconstruct.demo",
};

// 1x1 PNG and a minimal valid PDF
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;

type Row = { check: string; role: string; expected: string; actual: string; ok: boolean };
const rows: Row[] = [];
const rec = (check: string, role: string, expected: string, actual: string, ok: boolean) => rows.push({ check, role, expected, actual, ok });

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function main() {
  const tokens: Record<string, string> = {};
  const failedLogins: string[] = [];
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
    const j: any = await r.json();
    if (r.status === 200) tokens[role] = j.data.token;
    else failedLogins.push(`${role} (${r.status})`);
  }
  failIfLoginsFailed(failedLogins);
  await assertNoRealBlobStore(BASE, tokens["admin"] ?? Object.values(tokens)[0]!);

  // 1. round trip per role
  for (const role of Object.keys(tokens)) {
    for (const [name, mime, buf] of [["check.png", "image/png", PNG], ["check.pdf", "application/pdf", PDF]] as const) {
      const up = await call("POST", "/uploads", tokens[role], { filename: name, contentType: mime, dataUrl: dataUrl(mime, buf) });
      const j: any = await up.json().catch(() => ({}));
      if (up.status !== 201 && up.status !== 200) { rec(`upload ${name}`, role, "2xx", String(up.status), false); continue; }
      const url: string = j.data.url;
      const dl = await call("GET", `/uploads/file?url=${encodeURIComponent(url)}`, tokens[role]);
      const got = Buffer.from(await dl.arrayBuffer());
      rec(`round-trip ${name}`, role, "identical bytes + type", `${dl.status} ${dl.headers.get("content-type")} ${got.length}B ${sha(got) === sha(buf) ? "match" : "MISMATCH"}`, dl.status === 200 && sha(got) === sha(buf));
    }
  }

  const t = tokens["site"] ?? Object.values(tokens)[0]!;
  // 2. negative cases
  const neg: [string, any, number[]][] = [
    ["blocked type (.exe)", { filename: "run.exe", contentType: "application/x-msdownload", dataUrl: dataUrl("application/x-msdownload", Buffer.from("MZ")) }, [400, 422]],
    ["oversize (9 MB)", { filename: "big.pdf", contentType: "application/pdf", dataUrl: dataUrl("application/pdf", Buffer.alloc(9 * 1024 * 1024, 1)) }, [400, 413, 422]],
    ["malformed data URL", { filename: "x.png", contentType: "image/png", dataUrl: "not-a-data-url" }, [400, 422]],
    ["empty filename", { filename: "", contentType: "image/png", dataUrl: dataUrl("image/png", PNG) }, [400, 422]],
    ["missing body", {}, [400, 422]],
  ];
  for (const [name, body, okStatuses] of neg) {
    const r = await call("POST", "/uploads", t, body);
    rec(`reject: ${name}`, "site", okStatuses.join("/"), String(r.status), okStatuses.includes(r.status));
  }
  // content/extension mismatch: HTML bytes declared as a PNG (no content sniffing is done today)
  const spoof = await call("POST", "/uploads", t, { filename: "evil.png", contentType: "image/png", dataUrl: dataUrl("image/png", Buffer.from("<html><script>alert(1)</script></html>")) });
  rec("content sniffing: HTML bytes labelled image/png", "site", "rejected (400) ideally", String(spoof.status), spoof.status >= 400);

  // 3. download guards
  for (const [name, url, okStatuses] of [
    ["path traversal ../../.env", "/uploads/../../.env", [400, 404]],
    ["path traversal encoded", "/uploads/%2e%2e/%2e%2e/package.json", [400, 404]],
    ["unsupported location (file://)", "file:///etc/passwd", [400, 404]],
    ["unknown file", "/uploads/generic/does-not-exist.png", [404]],
  ] as [string, string, number[]][]) {
    const r = await call("GET", `/uploads/file?url=${encodeURIComponent(url)}`, t);
    rec(`download guard: ${name}`, "site", okStatuses.join("/"), String(r.status), okStatuses.includes(r.status));
  }
  const noTok = await call("GET", `/uploads/file?url=${encodeURIComponent("/uploads/generic/x.png")}`);
  rec("download without a token", "(none)", "401", String(noTok.status), noTok.status === 401);

  // 4. cross-role: finance receipts are reachable by roles that can read the expense list?
  const fin = await (await call("GET", "/finance/expenses", tokens["finance"])).json() as any;
  const list: any[] = Array.isArray(fin.data) ? fin.data : fin.data?.items ?? [];
  const receipt = list.map((e) => e.receiptUrl ?? e.receipt_url ?? e.attachmentUrl ?? e.fileUrl).find(Boolean) as string | undefined;
  if (receipt) {
    for (const role of ["site", "consultant", "engineer", "architect", "hr"]) {
      const r = await call("GET", `/uploads/file?url=${encodeURIComponent(receipt)}`, tokens[role]);
      rec("finance receipt readable by non-finance role", role, "403 ideally", String(r.status), r.status === 403 || r.status === 404);
    }
  } else rec("finance receipt cross-role", "-", "needs a receipt in seed data", "no receipt url found in /finance/expenses", false);

  const failed = rows.filter((r) => !r.ok);
  const md = [`# File handling check`, ``, `${rows.length} checks · ${rows.length - failed.length} pass · ${failed.length} need attention`, ``, `| Check | Role | Expected | Actual | Result |`, `|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.check} | ${r.role} | ${r.expected} | ${r.actual} | ${r.ok ? "PASS" : "**ATTENTION**"} |`)].join("\n");
  writeFileSync(`${outDir}/files-report.md`, md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
