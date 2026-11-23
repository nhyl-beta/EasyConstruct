// apps/api/src/modules/design/proposals/boq-import.ts
//
// The Bill of Materials behind a Design Proposal's estimated amount. The
// architect downloads a template, fills it in outside the app, and uploads
// it back — the sheet IS the source of truth for the amount; it is never a
// number typed into this app. Mirrors the attendance sheet import's
// discipline (apps/api/src/modules/workforce/attendance/import.ts): parsing
// takes the raw file every time, never a client-echoed total, so a value in
// a proposal's aiValidation/amount can always be traced back to what the
// file actually said.
//
// No DB or project lookups here (unlike attendance import) — a BOQ sheet is
// self-contained, so parsing is a pure function of the buffer and is safe
// and cheap to run twice: once for the preview, once more at submission.
import ExcelJS from "exceljs";
import { ValidationError } from "../../../core/utils/errors.js";
import type { LineItemValidationSummary } from "../../insights/index.js";

export const BOQ_UNITS = ["m", "m²", "m³", "kg", "ton", "bag", "pcs", "set", "lot", "l.s."] as const;
export const MAX_BOQ_ROWS = 200;

const HEADER_ALIASES: Record<string, string[]> = {
  description: ["description", "item", "item description", "material", "work item"],
  quantity: ["quantity", "qty"],
  unit: ["unit", "uom", "unit of measure"],
  unitCost: ["unit cost", "rate", "unit price", "unit rate", "cost per unit"],
};
const REQUIRED_COLUMNS = ["description", "quantity", "unit", "unitCost"] as const;
const COLUMN_LABEL: Record<(typeof REQUIRED_COLUMNS)[number], string> = {
  description: "Description",
  quantity: "Quantity",
  unit: "Unit",
  unitCost: "Unit Cost",
};

export interface ParsedBoqRow {
  row: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  /** quantity * unitCost — 0 for a row with any error, so a half-broken row never contributes to the total. */
  subtotal: number;
  errors: string[];
  /** Set by the controller after parsing (EstimationPro.ai cost-reference check), never by parseBoqSheet itself — this file stays a pure read of the sheet. */
  validation?: LineItemValidationSummary | null;
}

export interface BoqReport {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedBoqRow[];
  /** Sum of valid rows' subtotals — the estimated amount, as read from the file. */
  total: number;
}

const cellText = (value: ExcelJS.CellValue): string => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
};

const cellNumber = (value: ExcelJS.CellValue): number | null => {
  if (typeof value === "number") return value;
  const text = cellText(value).replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

interface RawRow {
  row: number;
  cells: Record<string, ExcelJS.CellValue>;
}

const readWorkbook = async (buffer: Buffer): Promise<RawRow[]> => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError("That file could not be read. Upload an Excel workbook (.xlsx), or start from the template.");
  }

  const sheet = workbook.getWorksheet("Bill of Materials") ?? workbook.worksheets[0];
  if (!sheet) throw new ValidationError("The workbook has no sheets.");

  const headerRow = sheet.getRow(1);
  const columnByField = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const header = cellText(cell.value).toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(header) && !columnByField.has(field)) columnByField.set(field, colNumber);
    }
  });

  const missing = REQUIRED_COLUMNS.filter((field) => !columnByField.has(field));
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing column${missing.length === 1 ? "" : "s"}: ${missing.map((f) => COLUMN_LABEL[f]).join(", ")}. ` +
        "The first row must contain the headers Description, Quantity, Unit, Unit Cost — use the template.",
    );
  }

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, ExcelJS.CellValue> = {};
    let any = false;
    for (const [field, col] of columnByField) {
      const value = row.getCell(col).value;
      cells[field] = value;
      if (cellText(value) !== "") any = true;
    }
    if (any) rows.push({ row: rowNumber, cells });
  });

  if (rows.length === 0) throw new ValidationError("The sheet has no bill-of-materials rows under the header.");
  if (rows.length > MAX_BOQ_ROWS) {
    throw new ValidationError(`The sheet has ${rows.length} rows; the limit is ${MAX_BOQ_ROWS} per upload.`);
  }
  return rows;
};

const validateRows = (raw: RawRow[]): ParsedBoqRow[] =>
  raw.map(({ row, cells }) => {
    const errors: string[] = [];
    const description = cellText(cells.description);
    if (!description) errors.push("Description is missing");

    const quantity = cellNumber(cells.quantity);
    if (quantity == null) errors.push(cellText(cells.quantity) ? `Quantity "${cellText(cells.quantity)}" isn't a number` : "Quantity is missing");
    else if (quantity <= 0) errors.push("Quantity must be greater than zero");

    const unitText = cellText(cells.unit);
    const unit = BOQ_UNITS.find((u) => u.toLowerCase() === unitText.toLowerCase()) ?? null;
    if (!unit) errors.push(unitText ? `Unit "${unitText}" isn't one of ${BOQ_UNITS.join(", ")}` : "Unit is missing");

    const unitCost = cellNumber(cells.unitCost);
    if (unitCost == null) errors.push(cellText(cells.unitCost) ? `Unit Cost "${cellText(cells.unitCost)}" isn't a number` : "Unit Cost is missing");
    else if (unitCost <= 0) errors.push("Unit Cost must be greater than zero");

    const subtotal = errors.length === 0 ? quantity! * unitCost! : 0;
    return { row, description, quantity, unit, unitCost, subtotal, errors };
  });

/** Parse + validate the uploaded sheet. Writes nothing. */
export const parseBoqSheet = async (buffer: Buffer, fileName: string): Promise<BoqReport> => {
  const rows = validateRows(await readWorkbook(buffer));
  const validRows = rows.filter((r) => r.errors.length === 0);
  return {
    fileName,
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.length - validRows.length,
    rows,
    total: validRows.reduce((sum, r) => sum + r.subtotal, 0),
  };
};

const php = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Plain-text rendering of the parsed sheet, folded into the proposal's description so reviewers see the basis without opening the file. */
export const formatBoqText = (report: BoqReport): string => {
  const valid = report.rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) return "";
  const lines = valid.map((r) => `- ${r.description} — ${r.quantity} ${r.unit} × ${php(r.unitCost!)}/${r.unit} = ${php(r.subtotal)}`);
  return ["Bill of materials (from the uploaded file):", ...lines, `Estimated amount (computed from the file): ${php(report.total)}`].join("\n");
};

export const buildBoqTemplate = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EasyConstruct";

  const sheet = workbook.addWorksheet("Bill of Materials");
  sheet.columns = [
    { header: "Description", key: "description", width: 40 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Unit Cost", key: "unitCost", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.addRow({ description: "Ready-mix concrete, Class A", quantity: 12, unit: "m³", unitCost: 6500 });
  sheet.addRow({ description: "Reinforcing steel bars", quantity: 850, unit: "kg", unitCost: 68 });
  sheet.addRow({ description: "Example row — delete me", quantity: "", unit: "", unitCost: "" });

  // Dropdown on Unit for the first MAX_BOQ_ROWS rows.
  for (let r = 2; r <= MAX_BOQ_ROWS + 1; r++) {
    sheet.getCell(`C${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${BOQ_UNITS.join(",")}"`],
    };
  }

  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ width: 110 }];
  [
    "How to fill in the Bill of Materials",
    "",
    "• One row per material or work item. Keep the header row exactly as it is.",
    "• Description: what the line covers (e.g. Ready-mix concrete, Class A).",
    "• Quantity: a positive number.",
    "• Unit: " + BOQ_UNITS.join(", ") + ". Pick from the dropdown.",
    "• Unit Cost: the rate per unit, in PHP, as a positive number.",
    "• The estimated amount is computed from this sheet — it is not typed anywhere in the app.",
    "• Delete the example rows before uploading.",
  ].forEach((line) => help.addRow([line]));

  return Buffer.from(await workbook.xlsx.writeBuffer());
};
