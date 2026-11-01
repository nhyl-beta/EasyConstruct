// qa:findings — builds qa/results/findings.md from the latest run: every Failed row grouped as
//   (a) matrix disagreement  (b) missing control  (c) wrong data  (d) crash / console error  (e) known defect
// each with its CSV ID. Reads results/latest.txt (the newest run directory) and, when present,
// results/functional-failure-classification.csv (from classify-functional) to split functional failures.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../spec.js";

const resultsDir = join(import.meta.dirname, "..", "..", "results");
const dir = process.argv[2] ?? readFileSync(join(resultsDir, "latest.txt"), "utf8").trim();
const load = (f: string) => {
  const file = join(dir, f);
  if (!existsSync(file)) return [] as Record<string, string>[];
  const [h, ...rows] = parseCsv(readFileSync(file, "utf8"));
  return rows.map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? ""])));
};
const m01 = load("01_access_matrix.csv"), m02 = load("02_lifecycle_test_cases.csv"), m03 = load("03_role_page_checks.csv");
const crawl: any[] = existsSync(join(dir, "crawl-findings.json")) ? JSON.parse(readFileSync(join(dir, "crawl-findings.json"), "utf8")) : [];
const classification = new Map<string, string>();
const clsFile = join(resultsDir, "functional-failure-classification.csv");
if (existsSync(clsFile)) { const [h, ...rs] = parseCsv(readFileSync(clsFile, "utf8")); for (const r of rs) classification.set(r[h!.indexOf("Check ID")]!, r[h!.indexOf("Classification")]!); }

type Item = { id: string; who: string; what: string; detail: string };
const groups: Record<"a" | "b" | "c" | "d" | "e", Item[]> = { a: [], b: [], c: [], d: [], e: [] };
const KNOWN = /(bug[- ]?\d+|known defect|@known|Projects-pagination|UserAccounts)/i;
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^\[(api|ui)\] ?/, "").replace(/ expect\(received\).*$/, "").slice(0, 190);

for (const r of m01) if (r["Status"] === "Failed") (KNOWN.test(r["Remarks"]!) ? groups.e : groups.a).push({ id: r["Test Case ID"]!, who: r["Role"]!, what: r["Objective"]!, detail: clean(r["Actual Results"]!) });
for (const r of m03) {
  if (r["Status"] !== "Failed") continue;
  const type = r["Objective"]!.split(" — ").pop()!, page = r["Objective"]!.split(" — ")[0]!, actual = clean(r["Actual Results"]!);
  const it: Item = { id: r["Test Case ID"]!, who: r["Role"]!, what: `${page} (${type})`, detail: actual };
  if (KNOWN.test(r["Remarks"]!)) { groups.e.push(it); continue; }
  const cls = classification.get(r["Test Case ID"]!);
  if (["DENIED", "READ-ONLY"].includes(type) || type.startsWith("ACTION")) groups.a.push(it);
  else if (/sidebar item/i.test(actual) || cls === "role not given the page" || cls === "matrix wrong") groups.a.push({ ...it, detail: `${actual}${cls ? ` [${cls}]` : ""}` });
  else if (/console error|failed network|failed requests/i.test(actual)) groups.d.push(it);
  else if (/not found|control missing|neither blocked|validation/i.test(actual) || cls === "control missing in app") groups.b.push(it);
  else if (cls === "selector gap in the test") groups.b.push({ ...it, detail: `${actual} [test selector gap]` });
  else groups.c.push(it);
}
for (const r of m02) {
  if (r["Status"] !== "Failed") continue;
  const it: Item = { id: `${r["Test Case ID"]} step ${r["Steps"]}`, who: r["Role"]!, what: r["Objective"]!.slice(0, 70), detail: clean(r["Actual Results"]!) };
  if (KNOWN.test(r["Remarks"]!)) groups.e.push(it); else groups.c.push(it);
}
for (const f of crawl) groups.d.push({ id: `CRAWL ${f.role} / ${f.page}`, who: f.role, what: f.kind, detail: String(f.detail).slice(0, 190) });

const titles: Record<keyof typeof groups, string> = { a: "(a) Matrix disagreements", b: "(b) Missing or non-working controls", c: "(c) Wrong data / behaviour differs from the spec", d: "(d) Crashes, console errors, failed requests", e: "(e) Known defects (tagged, stay Failed)" };
const lines = [`# QA findings`, ``, `Run: \`${dir}\`  `, `Failed rows: ${Object.values(groups).reduce((n, g) => n + g.length, 0)} (a ${groups.a.length}, b ${groups.b.length}, c ${groups.c.length}, d ${groups.d.length}, e ${groups.e.length})`, ``];
for (const k of ["a", "b", "c", "d", "e"] as const) {
  lines.push(`## ${titles[k]} — ${groups[k].length}`, ``);
  if (!groups[k].length) { lines.push("_none_", ""); continue; }
  lines.push("| ID | Role | What | Observed |", "|---|---|---|---|");
  for (const i of groups[k]) lines.push(`| ${i.id} | ${i.who} | ${i.what.replace(/\|/g, "/")} | ${i.detail.replace(/\|/g, "/")} |`);
  lines.push("");
}
writeFileSync(join(resultsDir, "findings.md"), lines.join("\n"));
console.log(`findings.md written: a ${groups.a.length}, b ${groups.b.length}, c ${groups.c.length}, d ${groups.d.length}, e ${groups.e.length}`);
