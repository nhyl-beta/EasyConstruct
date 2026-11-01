// CSV loader: reads qa/spec/*.csv at runtime so the spec stays the single source of truth.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SPEC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "spec");

/** RFC-4180 parser: BOM, quoted fields, doubled quotes, embedded newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function readCsv(file: string): Record<string, string>[] {
  const [head, ...body] = parseCsv(readFileSync(join(SPEC_DIR, file), "utf8"));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export const ACCESS_FILE = "01_access_matrix.csv";
export const LIFECYCLE_FILE = "02_lifecycle_test_cases.csv";
export const CHECKS_FILE = "03_role_page_checks.csv";

/** Matrix values. "Scoped", "Reference read", "Names only" and "Directory only" were added by the owner decisions of 2026-11-01. */
export type Access = "Full" | "View only" | "Deny" | "Allowed" | "Scoped" | "Reference read" | "Names only" | "Directory only" | "Basic list";
/** Values that allow the read of a page's endpoint. */
export const READS_ALLOWED: Access[] = ["Full", "View only", "Scoped", "Reference read", "Names only", "Directory only", "Basic list"];
/** Values that allow a write through the page's endpoint. */
export const WRITES_ALLOWED: Access[] = ["Full"];
export interface MatrixRow { page: string; isAction: boolean; byRole: Record<string, Access>; notes: string; automation: string }
export interface Check { id: string; role: string; page: string; type: string; procedure: string; expected: string; automation: string }
export interface Step {
  id: string; stage: string; module: string; objective: string; precondition: string; testData: string;
  step: number; actor: string; procedure: string; expected: string; automation: string; priority: string;
}

export function loadMatrix(): MatrixRow[] {
  return readCsv(ACCESS_FILE).map((r) => {
    const page = r["Page / Function"]!;
    const byRole: Record<string, Access> = {};
    for (const k of Object.keys(r)) if (!["Page / Function", "Automation", "Notes", "Confirmation"].includes(k)) byRole[k] = r[k] as Access;
    return { page, isAction: page.startsWith("ACTION:") || page.startsWith("FUNCTION:"), byRole, notes: r["Notes"] ?? "", automation: r["Automation"] ?? "" };
  });
}

export function loadChecks(): Check[] {
  return readCsv(CHECKS_FILE).map((r) => ({
    id: r["Check ID"]!, role: r["Role"]!, page: r["Page / Function"]!, type: r["Check Type"]!,
    procedure: r["Test Procedure"]!, expected: r["Expected Results"]!, automation: r["Automation"]!,
  }));
}

/** File 02 repeats Case ID on each row but the case-level columns only on the first; fill them down. */
export function loadSteps(): Step[] {
  const out: Step[] = [];
  let cur: Partial<Step> = {};
  for (const r of readCsv(LIFECYCLE_FILE)) {
    if (r["Objective"]) cur = { stage: r["Lifecycle Stage"], module: r["Module"], objective: r["Objective"], precondition: r["Precondition"], testData: r["Test Data"], priority: r["Priority"] };
    out.push({
      id: r["Test Case ID"]!, stage: cur.stage ?? "", module: cur.module ?? "", objective: cur.objective ?? "",
      precondition: cur.precondition ?? "", testData: cur.testData ?? "", step: Number(r["Steps"]),
      actor: r["Actor Role"]!, procedure: r["Test Procedure"]!, expected: r["Expected Results"]!,
      automation: r["Automation"]!, priority: cur.priority ?? "",
    });
  }
  return out;
}

export const checksFor = (types: string[]) => loadChecks().filter((c) => types.includes(c.type));

let matrixCache: MatrixRow[] | null = null;
/** The access value for a role on a page / function row ("Deny" when the row does not exist). */
export function levelOf(roleLabel: string, page: string): Access {
  matrixCache ??= loadMatrix();
  return (matrixCache.find((m) => m.page === page)?.byRole[roleLabel] as Access | undefined) ?? "Deny";
}
