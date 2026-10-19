// apps/api/src/scripts/demo-files.ts
//
// Tiny dependency-free generators for the small, readable demo files (PDF with
// a title block, PNG with drawn text) plus an upload helper that sends them
// through the app's own POST /api/uploads path — so they land wherever the app
// stores files (private Vercel Blob when configured, local disk otherwise) and
// download through the authenticated GET /api/uploads/file route.
import zlib from "node:zlib";

// ── PDF ────────────────────────────────────────────────────────────────────

/** A one-page PDF: bold-ish title block on top, then body lines. */
export function textPdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[()\\]/g, "\\$&").replace(/[^\x20-\x7e]/g, "-");
  const parts: string[] = [];
  parts.push(`BT /F2 18 Tf 50 740 Td (${esc(title)}) Tj ET`);
  parts.push("0.6 w 50 728 m 562 728 l S");
  lines.slice(0, 30).forEach((l, i) => parts.push(`BT /F1 11 Tf 50 ${706 - i * 18} Td (${esc(l)}) Tj ET`));
  const stream = parts.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
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

// ── PNG ────────────────────────────────────────────────────────────────────

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

// Classic 5x7 bitmap font (rows of 5 bits), enough for title blocks.
const FONT: Record<string, string> = {
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  "-": "00000 00000 00000 11111 00000 00000 00000", ".": "00000 00000 00000 00000 00000 00110 00110",
  ":": "00000 00110 00110 00000 00110 00110 00000", "/": "00001 00010 00010 00100 01000 01000 10000",
  " ": "00000 00000 00000 00000 00000 00000 00000",
};

/**
 * A PNG with a coloured scene and readable text lines (title block). `variant`
 * changes the colours/shapes so different files look different.
 */
export function titlePng(lines: string[], variant = 0): Buffer {
  const scale = 3;
  const w = 480;
  const h = 270;
  const px = Buffer.alloc(w * h * 3);
  const palettes: [number, number, number][][] = [
    [[226, 236, 246], [60, 90, 130]],
    [[238, 232, 220], [120, 90, 50]],
    [[225, 240, 228], [50, 110, 70]],
    [[240, 228, 228], [140, 60, 60]],
  ];
  const [bg, fg] = palettes[variant % palettes.length]!;
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = bg![0]!;
    px[i * 3 + 1] = bg![1]!;
    px[i * 3 + 2] = bg![2]!;
  }
  const set = (x: number, y: number, rgb: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    px[i] = rgb[0]!;
    px[i + 1] = rgb[1]!;
    px[i + 2] = rgb[2]!;
  };
  // scene: ground band and a few building blocks
  for (let y = 190; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [fg![0]! + 60, fg![1]! + 60, fg![2]! + 60]);
  for (let b = 0; b < 4; b++) {
    const bx = 30 + b * 105 + ((variant * 13) % 20);
    const bh = 50 + ((b * 37 + variant * 11) % 70);
    for (let y = 190 - bh; y < 190; y++) for (let x = bx; x < bx + 70; x++) set(x, y, fg!);
  }
  // title block
  for (let y = 0; y < 18 + lines.length * 10 * scale; y++) for (let x = 0; x < w; x++) set(x, y, [255, 255, 255]);
  lines.forEach((line, li) => {
    let cx = 8;
    const cy = 6 + li * 8 * scale;
    for (const ch of line.toUpperCase().replace("·", "-")) {
      const glyph = (FONT[ch] ?? FONT[" "]!).split(" ");
      glyph.forEach((row, ry) =>
        [...row].forEach((bit, rx) => {
          if (bit === "1") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(cx + rx * scale + sx, cy + ry * scale + sy, [20, 30, 50]);
        }),
      );
      cx += 6 * scale;
    }
  });
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

// ── Upload through the app's own endpoint ──────────────────────────────────

export interface StoredUpload {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export async function uploadBytes(
  base: string,
  token: string,
  filename: string,
  contentType: string,
  bytes: Buffer,
): Promise<StoredUpload> {
  const res = await fetch(`${base}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename, contentType, dataUrl: `data:${contentType};base64,${bytes.toString("base64")}` }),
  });
  const json = (await res.json()) as { data?: StoredUpload; message?: string };
  if (!res.ok) throw new Error(`upload ${filename} -> ${res.status}: ${json.message}`);
  return json.data!;
}

export const uploadPdf = (base: string, token: string, filename: string, title: string, lines: string[]) =>
  uploadBytes(base, token, filename, "application/pdf", textPdf(title, lines));

export const uploadPng = (base: string, token: string, filename: string, lines: string[], variant = 0) =>
  uploadBytes(base, token, filename, "image/png", titlePng(lines, variant));
