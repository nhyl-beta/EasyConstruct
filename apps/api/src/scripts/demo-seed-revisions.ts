// apps/api/src/scripts/demo-seed-revisions.ts
//
// Demo data for the Architect's Revisions page: three tracked items on
// DEMO-S3, each with several versions, built through the real API (same
// path the UI uses: upload the file, then POST /revisions) and reviewed by the
// demo Consultant so every status shows up. Idempotent: an item that already
// has revisions is left alone.
//
// Prerequisites: `npm run dev` running, `npm run db:seed` and
// `npm run demo:seed` applied. Run with: npx tsx src/scripts/demo-seed-revisions.ts
import "dotenv/config";
import zlib from "node:zlib";
import { assertDemoApi, assertDemoDatabase } from "./demo-guard.js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8000/api";
const PASSWORD = "Demo@12345";
const PROJECT = process.env.REVISION_DEMO_PROJECT ?? "DEMO-S3";

async function api<T = any>(path: string, token: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.form ? {} : { "Content-Type": "application/json" }),
    },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const json = (await res.json()) as { data?: T; message?: string };
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  return json.data as T;
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { data?: { token?: string }; message?: string };
  if (!res.ok) throw new Error(`Login failed for ${email}: ${json.message}`);
  return json.data!.token!;
}

// ── tiny file generators (no dependencies) ────────────────────────────────

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A simple floor-plan-like PNG: outer walls plus `rooms` partitions, so each version looks different. */
function planPng(rooms: number): Buffer {
  const w = 360;
  const h = 220;
  const px = Buffer.alloc(w * h * 3, 250);
  const set = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * w + x) * 3;
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
  };
  const wall: [number, number, number] = [40, 60, 90];
  for (let x = 20; x < w - 20; x++) for (const t of [0, 1, 2]) { set(x, 20 + t, wall); set(x, h - 22 + t, wall); }
  for (let y = 20; y < h - 20; y++) for (const t of [0, 1, 2]) { set(20 + t, y, wall); set(w - 22 + t, y, wall); }
  for (let r = 1; r <= rooms; r++) {
    const x = 20 + Math.round(((w - 40) * r) / (rooms + 1));
    for (let y = 20; y < h - 20; y++) for (const t of [0, 1]) set(x + t, y, [90, 120, 170]);
  }
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A minimal one-page PDF carrying a line of text. */
function textPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 14 Tf 50 740 Td ${lines.map((l, i) => `${i ? "0 -22 Td " : ""}(${esc(l)}) Tj`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function uploadFile(token: string, name: string, type: string, bytes: Buffer) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  return api<{ url: string; filename: string; contentType: string; sizeBytes: number }>("/uploads/stream", token, { method: "POST", form });
}

interface Version {
  label: string;
  summary: string;
  file: { name: string; type: string; bytes: Buffer };
  /** What the consultant does with it afterwards. */
  review?: { status: "Under Review" | "Approved" | "Rejected"; comment?: string }[];
}

async function addVersions(
  architect: string,
  consultant: string,
  target: { itemType: "design" | "blueprint" | "plan"; itemId?: number; newTitle?: string; title: string },
  versions: Version[],
) {
  let itemId = target.itemId;
  if (itemId != null) {
    const existing = await api<unknown[]>(`/revisions/by-item/${target.itemType}/${itemId}`, architect);
    if (existing.length > 0) {
      console.log(`  ${target.itemType} "${target.title}": already has ${existing.length} revision(s) — skipped`);
      return;
    }
  }
  for (const [i, v] of versions.entries()) {
    const stored = await uploadFile(architect, v.file.name, v.file.type, v.file.bytes);
    const body = {
      projectCode: PROJECT,
      itemType: target.itemType,
      ...(itemId != null ? { itemId } : { newItem: { title: target.newTitle! } }),
      versionLabel: v.label,
      changeSummary: v.summary,
      file: { url: stored.url, fileName: stored.filename, fileSize: stored.sizeBytes, mimeType: stored.contentType },
    };
    const created = await api<{ id: number; itemId: number; versionNumber: number }>("/revisions", architect, { method: "POST", body });
    itemId = created.itemId;
    for (const step of v.review ?? []) {
      await api(`/revisions/${created.id}/status`, consultant, { method: "PATCH", body: { status: step.status, comment: step.comment } });
    }
    console.log(`  ${target.title}: v${created.versionNumber} (${v.label})${v.review?.length ? ` -> ${v.review.at(-1)!.status}` : ""}`);
    void i;
  }
}

async function main() {
  assertDemoDatabase();
  assertDemoApi(BASE);
  const architect = await login("architect@easyconstruct.demo");
  const consultant = await login("consultant@easyconstruct.demo");

  const designs = await api<{ id: number; name: string }[]>(`/designs?projectCode=${PROJECT}`, architect);
  const blueprints = await api<{ id: number; title: string; projectCode: string | null }[]>(`/blueprints?projectCode=${PROJECT}`, architect);

  console.log(`Seeding revisions on ${PROJECT}`);

  if (designs[0]) {
    await addVersions(architect, consultant, { itemType: "design", itemId: designs[0].id, title: designs[0].name }, [
      { label: "Rev A", summary: "Initial schematic layout issued for coordination.", file: { name: "layout-rev-a.png", type: "image/png", bytes: planPng(1) }, review: [{ status: "Approved" }] },
      { label: "Rev B", summary: "Added a second partition after the structural review; stair core moved 1.2 m east.", file: { name: "layout-rev-b.png", type: "image/png", bytes: planPng(2) }, review: [{ status: "Under Review" }, { status: "Rejected", comment: "Egress distance from the east stair exceeds the allowed travel length. Please re-check." }] },
      { label: "Rev C", summary: "Reworked egress: second stair added at the west end; partitions regularised.", file: { name: "layout-rev-c.png", type: "image/png", bytes: planPng(3) }, review: [{ status: "Under Review" }, { status: "Approved", comment: "Egress now compliant." }] },
      { label: "Rev D", summary: "Adjusted partitions for the mechanical riser; awaiting review.", file: { name: "layout-rev-d.png", type: "image/png", bytes: planPng(4) } },
    ]);
  }

  if (blueprints[0]) {
    await addVersions(architect, consultant, { itemType: "blueprint", itemId: blueprints[0].id, title: blueprints[0].title }, [
      { label: "Issue 1", summary: "First issue of the drawing set for the project file.", file: { name: "drawing-set-issue-1.pdf", type: "application/pdf", bytes: textPdf(["Drawing set - Issue 1", "Initial issue"]) }, review: [{ status: "Approved" }] },
      { label: "Issue 2", summary: "Updated title block and revised scale notes.", file: { name: "drawing-set-issue-2.pdf", type: "application/pdf", bytes: textPdf(["Drawing set - Issue 2", "Title block and scale notes revised"]) }, review: [{ status: "Under Review" }] },
    ]);
  }

  // Re-use the plan item from an earlier run (keyed on its title) so re-running adds nothing.
  const planDocs = await api<{ id: number; title: string }[]>("/architect-documents", architect);
  const existingPlan = planDocs.find((d) => d.title === "Ground floor plan");
  await addVersions(
    architect,
    consultant,
    { itemType: "plan", itemId: existingPlan?.id, newTitle: "Ground floor plan", title: "Ground floor plan" },
    [
      { label: "P1", summary: "Ground floor plan, first coordinated issue.", file: { name: "ground-floor-p1.png", type: "image/png", bytes: planPng(2) }, review: [{ status: "Approved" }] },
      { label: "P2", summary: "Loading bay widened; fire door added to the east wall.", file: { name: "ground-floor-p2.png", type: "image/png", bytes: planPng(3) }, review: [{ status: "Under Review" }] },
      { label: "P3", summary: "Accessible entrance ramp added; doors renumbered.", file: { name: "ground-floor-p3.png", type: "image/png", bytes: planPng(5) } },
    ],
  );

  console.log("Done.");
}

main().catch((err) => {
  console.error("demo-seed-revisions failed:", err.message);
  process.exitCode = 1;
});
