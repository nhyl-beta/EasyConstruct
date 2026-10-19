// Shared CSV export.
//
// hr-employees.tsx had a working inline implementation while the Export
// buttons on hr-payroll.tsx and hr-dashboard.tsx were decorative — rendered
// with no onClick at all. Extracted here so every Export button runs the same
// escaping and filename logic instead of each screen re-deriving it (or not).

/** RFC 4180 quoting: wrap in quotes, double any embedded quote. */
function escapeCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

/**
 * Build a CSV and hand it to the browser as a download.
 * `filename` is suffixed with today's date, so repeated exports don't
 * silently overwrite each other in the downloads folder.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>,
): void {
  const csv = toCsv(headers, rows);
  // The BOM makes Excel open UTF-8 correctly — without it, peso signs and
  // accented names in the employee roster render as mojibake.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
