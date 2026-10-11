import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { PAGINATION_EXEMPT } from "./pagination-exempt";

const SRC = resolve(process.cwd(), "src");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const files = walk(SRC)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => relative(SRC, f).split(sep).join("/"))
  .filter((f) => !f.startsWith("components/ui/") && !f.startsWith("pages/dev/"));

// A reference to any of the app's pagination mechanisms.
const PAGED = /DataTablePagination|usePagination|useServerList|\bPaged\b|use\w*Paged|ProjectsPagination|pageItems/;
// Renders a table body, or maps a list of records (keyed by an id-like field).
const TABLE = /<TableBody|<tbody/;
const RECORD_MAP =
  /\.map\(\(?([A-Za-z_]\w*)(?:, ?\w+)?\)? =>[^\n]*\n(?:[^\n]*\n){0,2}?[^\n]*key=\{\1\.(?:id|dbId|code|requestId|documentId|key)\b/;

const text = (f: string) => readFileSync(join(SRC, f), "utf8").replace(/\r\n/g, "\n");
const rendersRecords = (s: string) => TABLE.test(s) || RECORD_MAP.test(s);

describe("every list of records is paginated or has a recorded reason", () => {
  const exempt = new Set(PAGINATION_EXEMPT.map((e) => e.file));

  it("scans the source", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("flags no table or record list without pagination unless it is exempt", () => {
    const missing = files.filter((f) => {
      const s = text(f);
      return rendersRecords(s) && !PAGED.test(s) && !exempt.has(f);
    });
    expect(
      missing,
      `These files render a table or list of records without pagination. Paginate them (DataTablePagination + usePagination) or add them to config/pagination-exempt.ts with a reason:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the exemption list honest: each entry exists, still needs it, and has a reason", () => {
    for (const { file, reason } of PAGINATION_EXEMPT) {
      expect(files, `${file} does not exist`).toContain(file);
      expect(reason.trim().length, `${file} has no reason`).toBeGreaterThan(10);
      const s = text(file);
      expect(
        rendersRecords(s) && !PAGED.test(s),
        `${file} is paginated now (or renders no records); remove it from the exemption list`,
      ).toBe(true);
    }
  });

  it("lists no file twice", () => {
    expect(new Set(PAGINATION_EXEMPT.map((e) => e.file)).size).toBe(PAGINATION_EXEMPT.length);
  });
});
