// The transmittal cover sheet as a PDF and as an HTML email body. Both mirror the printable form on screen
// (apps/web/src/pages/roles/shared/print-pages.tsx TransmittalForm): same rows, same order, same wording.
import PDFDocument from "pdfkit";
import type { Transmittal, TransmittalAcknowledgement, TransmittalItem } from "../../../core/db/schema/design-requests.js";

export type TransmittalForm = Transmittal & { items: TransmittalItem[]; acknowledgements?: TransmittalAcknowledgement[] };
export interface FormProject {
  name: string;
  location: string | null;
}

// Same labels and order as the web form's TRANSMITTAL_PURPOSES (apps/web/src/features/requests/types/request.types.ts).
export const PURPOSES: [string, string][] = [
  ["for-document", "For document"],
  ["for-staff", "For staff"],
  ["for-information", "For information / dissemination"],
  ["for-comments", "For comments"],
  ["for-recommending-approval", "For recommending approval"],
  ["for-other-personnel", "For other personnel"],
  ["for-compliance", "For compliance / implementation"],
  ["for-review", "For review / evaluation"],
  ["for-approval", "For approval"],
  ["for-computation", "For computation"],
  ["plans-drawing", "Plans / drawing"],
  ["communication", "Communication"],
  ["specification", "Specification"],
  ["billing", "Billing"],
  ["others", "Others"],
];

const longDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }) : "";
// A plain YYYY-MM-DD is a calendar day, not an instant: read it as that day, whatever the server's zone.
const issuedOn = (iso: string) => longDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00+08:00` : iso);

const purposeLabel = (row: TransmittalForm, value: string, label: string) =>
  value === "others" && row.purposeOther ? `Others: ${row.purposeOther}` : label;

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The cover sheet as the body of the email, so the details are readable without opening the attachment. */
export const buildTransmittalHtml = (row: TransmittalForm, project: FormProject | null): string => {
  const th = 'style="border:1px solid #333;background:#f0f0f0;padding:4px 6px;text-align:left;font-weight:600;width:18%"';
  const td = 'style="border:1px solid #333;padding:4px 6px"';
  const box = (on: boolean, label: string) => `${on ? "&#9745;" : "&#9744;"} ${esc(label)}`;
  const items = row.items.length ? row.items : [];
  return `<div style="font-family:Arial,sans-serif;font-size:13px;color:#111;max-width:680px">
<table width="100%" style="border-collapse:collapse;margin-bottom:6px"><tr><td><b style="font-size:18px">EasyConstruct</b><br><small style="color:#555">Construction &middot; Design &middot; Project Management</small></td><td align="right"><b style="font-size:16px">TRANSMITTAL</b><br><small style="color:#555">Control no. ${esc(row.controlNo)}</small></td></tr></table>
<table width="100%" style="border-collapse:collapse">
<tr><th ${th}>Date</th><td ${td}>${esc(issuedOn(row.dateIssued))}</td><th ${th}>Control no.</th><td ${td}><b>${esc(row.controlNo)}</b></td></tr>
<tr><th ${th}>Project</th><td ${td}>${esc(project?.name ?? row.projectCode)}</td><th ${th}>Location</th><td ${td}>${esc(row.location ?? project?.location)}</td></tr>
<tr><th ${th}>To</th><td ${td}>${esc(row.toName)}</td><th ${th}>Sent mode</th><td ${td}>${esc(row.sentMode)}</td></tr>
<tr><th ${th}>Type</th><td ${td} colspan="3">${box(row.type === "inter-office", "Inter-office")} &nbsp; ${box(row.type === "inter-agency", "Inter-agency")}</td></tr>
<tr><th ${th}>Subject</th><td ${td} colspan="3">${esc(row.subject)}</td></tr>
</table>
<p style="margin:10px 0 2px"><b>Purpose</b></p>
<table width="100%" style="border-collapse:collapse"><tr><td ${td}>${PURPOSES.map(([v, l]) => `<span style="display:inline-block;width:32%;margin:2px 0">${box(row.purposes.includes(v), purposeLabel(row, v, l))}</span>`).join("")}</td></tr></table>
<table width="100%" style="border-collapse:collapse;margin-top:10px">
<tr><th ${th.replace("18%", "6%")}>#</th><th ${th.replace("18%", "60%")}>Request no. / particulars</th><th ${th.replace("18%", "28%")}>Remarks</th></tr>
${items.map((it, i) => `<tr><td ${td}>${i + 1}</td><td ${td}>${esc(it.particulars)}</td><td ${td}>${esc(it.remarks)}</td></tr>`).join("") || `<tr><td ${td}>&nbsp;</td><td ${td}></td><td ${td}></td></tr>`}
</table>
<table width="100%" style="border-collapse:collapse;margin-top:10px">
<tr><th ${th}>Transmitted by</th><td ${td}>${esc(row.transmittedByName)}</td><th ${th}>Received by</th><td ${td}>${esc(row.receivedByName)}</td></tr>
</table>
<p style="color:#555;margin-top:10px">The signed form is attached as a PDF (${esc(row.controlNo)}.pdf).</p>
</div>`;
};

const M = 40; // page margin
const W = 595.28 - M * 2; // usable width on A4

/** The cover sheet as a one-or-more page A4 PDF. */
export const buildTransmittalPdf = (row: TransmittalForm, project: FormProject | null): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: `Transmittal ${row.controlNo}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const FS = 9;
    const PAD = 4;
    let y = M;

    const ensure = (h: number) => {
      if (y + h > 842 - M) {
        doc.addPage();
        y = M;
      }
    };
    const box = (x: number, top: number, on: boolean, label: string, w: number) => {
      doc.lineWidth(0.7).rect(x, top + 1, 8, 8).stroke("#333");
      if (on) doc.moveTo(x + 1.5, top + 5).lineTo(x + 3.5, top + 8).lineTo(x + 7, top + 2).lineWidth(1).stroke("#111");
      doc.fillColor("#111").font("Helvetica").fontSize(FS).text(label, x + 13, top, { width: w - 13, lineBreak: false });
    };
    // One table row: cells are { w, text, th?, bold?, check? }; the row is as tall as its tallest cell.
    type Cell = { w: number; text?: string; th?: boolean; bold?: boolean; checks?: [boolean, string][]; sig?: boolean };
    const tableRow = (cells: Cell[], minH = 0) => {
      doc.font("Helvetica-Bold").fontSize(FS);
      const heights = cells.map((c) => {
        if (c.checks || c.sig) return 16;
        doc.font(c.th || c.bold ? "Helvetica-Bold" : "Helvetica");
        return doc.heightOfString(c.text || " ", { width: c.w - PAD * 2 }) + PAD * 2;
      });
      const h = Math.max(minH, ...heights);
      ensure(h);
      let x = M;
      for (const c of cells) {
        if (c.th) doc.rect(x, y, c.w, h).fillAndStroke("#f0f0f0", "#333");
        else doc.rect(x, y, c.w, h).lineWidth(0.7).stroke("#333");
        if (c.checks) {
          let cx = x + PAD;
          for (const [on, label] of c.checks) {
            box(cx, y + PAD + 1, on, label, 90);
            cx += 100;
          }
        } else if (c.sig) {
          doc.moveTo(x + PAD, y + h - PAD - 2).lineTo(x + c.w - PAD, y + h - PAD - 2).lineWidth(0.7).stroke("#333");
        } else {
          doc.fillColor("#111").font(c.th || c.bold ? "Helvetica-Bold" : "Helvetica").fontSize(FS).text(c.text ?? "", x + PAD, y + PAD, { width: c.w - PAD * 2 });
        }
        x += c.w;
      }
      y += h;
    };
    const heading = (t: string) => {
      ensure(24);
      y += 8;
      doc.fillColor("#111").font("Helvetica-Bold").fontSize(FS).text(t, M, y, { lineBreak: false });
      y += 14;
    };

    // Header
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(16).text("EasyConstruct", M, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor("#555").text("Construction · Design · Project Management", M, y + 20, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text("TRANSMITTAL", M, y, { width: W, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor("#555").text(`Control no. ${row.controlNo}`, M, y + 20, { width: W, align: "right", lineBreak: false });
    y += 34;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.5).stroke("#111");
    y += 10;

    const a = 0.17 * W, b = 0.28 * W; // label and value widths of the 4-column rows
    const c3 = W - a;
    tableRow([{ w: a, text: "Date", th: true }, { w: b + 0.05 * W, text: issuedOn(row.dateIssued) }, { w: a, text: "Control no.", th: true }, { w: W - 2 * a - b - 0.05 * W, text: row.controlNo, bold: true }]);
    tableRow([{ w: a, text: "Project", th: true }, { w: b + 0.05 * W, text: project?.name ?? row.projectCode }, { w: a, text: "Location", th: true }, { w: W - 2 * a - b - 0.05 * W, text: row.location ?? project?.location ?? "" }], 30);
    tableRow([{ w: a, text: "To", th: true }, { w: b + 0.05 * W, text: row.toName }, { w: a, text: "Sent mode", th: true }, { w: W - 2 * a - b - 0.05 * W, text: row.sentMode ?? "" }]);
    tableRow([{ w: a, text: "Type", th: true }, { w: c3, checks: [[row.type === "inter-office", "Inter-office"], [row.type === "inter-agency", "Inter-agency"]] }]);
    tableRow([{ w: a, text: "Subject", th: true }, { w: c3, text: row.subject }]);

    heading("Purpose");
    const colW = W / 3;
    const rowsOfPurposes = Math.ceil(PURPOSES.length / 3);
    const boxH = rowsOfPurposes * 16 + 6;
    ensure(boxH);
    doc.rect(M, y, W, boxH).lineWidth(0.7).stroke("#333");
    PURPOSES.forEach(([v, l], i) => {
      box(M + PAD + (i % 3) * colW, y + 5 + Math.floor(i / 3) * 16, row.purposes.includes(v), purposeLabel(row, v, l), colW - PAD);
    });
    y += boxH + 10;

    const nW = 0.06 * W, rW = 0.28 * W;
    tableRow([{ w: nW, text: "#", th: true }, { w: W - nW - rW, text: "Request no. / particulars", th: true }, { w: rW, text: "Remarks", th: true }]);
    for (let i = 0; i < Math.max(row.items.length, 6); i++) {
      const it = row.items[i];
      tableRow([{ w: nW, text: it ? String(i + 1) : "" }, { w: W - nW - rW, text: it?.particulars ?? "" }, { w: rW, text: it?.remarks ?? "" }], 14);
    }

    y += 10;
    const half = W / 2;
    tableRow([{ w: a, text: "Transmitted by", th: true }, { w: half - a, text: row.transmittedByName }, { w: a, text: "Received by", th: true }, { w: half - a, text: row.receivedByName ?? "" }]);
    tableRow([{ w: a, text: "Signature", th: true }, { w: half - a, sig: true }, { w: a, text: "Signature", th: true }, { w: half - a, sig: true }], 34);

    heading("Receipt / acknowledgement");
    const q = W / 4;
    tableRow([{ w: q, text: "Name", th: true }, { w: q, text: "Signature", th: true }, { w: q, text: "Department / office", th: true }, { w: q, text: "Date", th: true }]);
    const acks = row.acknowledgements ?? [];
    for (let i = 0; i < Math.max(acks.length, 3); i++) {
      const k = acks[i];
      tableRow([{ w: q, text: k?.name ?? "" }, { w: q, text: k?.signature ?? "" }, { w: q, text: k?.office ?? "" }, { w: q, text: k ? longDate(k.acknowledgedAt) : "" }], 14);
    }
    doc.end();
  });
