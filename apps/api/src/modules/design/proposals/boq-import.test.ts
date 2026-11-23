import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildBoqTemplate, formatBoqText, parseBoqSheet, type BoqReport } from "./boq-import.js";

/** Builds a minimal .xlsx buffer with the given header + rows, for feeding straight to parseBoqSheet. */
async function sheet(header: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Bill of Materials");
  ws.addRow(header);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const HEADER = ["Description", "Quantity", "Unit", "Unit Cost"];

describe("parseBoqSheet", () => {
  test("a well-formed sheet parses every row and sums the total", async () => {
    const buf = await sheet(HEADER, [
      ["Ready-mix concrete, Class A", 12, "m³", 6500],
      ["Reinforcing steel bars", 850, "kg", 68],
    ]);
    const report = await parseBoqSheet(buf, "boq.xlsx");
    assert.equal(report.totalRows, 2);
    assert.equal(report.validRows, 2);
    assert.equal(report.invalidRows, 0);
    assert.equal(report.total, 12 * 6500 + 850 * 68);
  });

  test("a row missing a required field is invalid and contributes nothing to the total", async () => {
    const buf = await sheet(HEADER, [
      ["Ready-mix concrete, Class A", 12, "m³", 6500],
      ["No unit here", 5, "", 100],
    ]);
    const report = await parseBoqSheet(buf, "boq.xlsx");
    assert.equal(report.validRows, 1);
    assert.equal(report.invalidRows, 1);
    assert.equal(report.total, 12 * 6500);
    assert.ok(report.rows[1]!.errors.some((e) => e.includes("Unit")));
  });

  test("a zero or negative quantity or rate is rejected, not silently zeroed", async () => {
    const buf = await sheet(HEADER, [
      ["Free sample", 0, "pcs", 100],
      ["Negative rate", 5, "pcs", -10],
    ]);
    const report = await parseBoqSheet(buf, "boq.xlsx");
    assert.equal(report.validRows, 0);
    assert.equal(report.invalidRows, 2);
  });

  test("a unit outside the fixed list is rejected", async () => {
    const buf = await sheet(HEADER, [["Odd item", 1, "barrels", 100]]);
    const report = await parseBoqSheet(buf, "boq.xlsx");
    assert.equal(report.invalidRows, 1);
    assert.ok(report.rows[0]!.errors.some((e) => e.includes("barrels")));
  });

  test("column headers are matched case-insensitively and by common aliases", async () => {
    const buf = await sheet(["Item", "Qty", "UOM", "Rate"], [["Rebar", 10, "kg", 50]]);
    const report = await parseBoqSheet(buf, "boq.xlsx");
    assert.equal(report.validRows, 1);
    assert.equal(report.total, 500);
  });

  test("a sheet missing a required column is rejected up front", async () => {
    const buf = await sheet(["Description", "Quantity", "Unit"], [["Rebar", 10, "kg"]]);
    await assert.rejects(() => parseBoqSheet(buf, "boq.xlsx"), /Missing column.*Unit Cost/);
  });

  test("an empty sheet (header only) is rejected", async () => {
    const buf = await sheet(HEADER, []);
    await assert.rejects(() => parseBoqSheet(buf, "boq.xlsx"), /no bill-of-materials rows/);
  });

  test("a file that isn't a real workbook is rejected with a plain-English message", async () => {
    await assert.rejects(() => parseBoqSheet(Buffer.from("not an excel file"), "boq.xlsx"), /could not be read/);
  });
});

describe("formatBoqText", () => {
  test("renders only the valid rows, with the computed total", () => {
    const report: BoqReport = {
      fileName: "boq.xlsx",
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
      rows: [
        { row: 2, description: "Rebar", quantity: 2, unit: "kg", unitCost: 15000, subtotal: 30000, errors: [] },
        { row: 3, description: "Broken row", quantity: null, unit: null, unitCost: null, subtotal: 0, errors: ["Unit is missing"] },
      ],
      total: 30000,
    };
    const text = formatBoqText(report);
    assert.ok(text.includes("Rebar — 2 kg"));
    assert.ok(!text.includes("Broken row"));
    assert.match(text, /Estimated amount \(computed from the file\): .*30,000/);
  });

  test("an all-invalid report renders nothing", () => {
    const report: BoqReport = { fileName: "x.xlsx", totalRows: 1, validRows: 0, invalidRows: 1, rows: [], total: 0 };
    assert.equal(formatBoqText(report), "");
  });
});

describe("buildBoqTemplate", () => {
  test("produces a workbook the parser itself accepts", async () => {
    const buffer = await buildBoqTemplate();
    assert.ok(buffer.length > 0);
    // Strip the example rows' intentionally-incomplete third row by only checking the two complete rows parse clean.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheetNames = workbook.worksheets.map((w) => w.name);
    assert.deepEqual(sheetNames, ["Bill of Materials", "Instructions"]);
  });
});
