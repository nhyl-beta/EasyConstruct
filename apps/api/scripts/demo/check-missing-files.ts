// apps/api/scripts/demo/check-missing-files.ts
//
// READ-ONLY audit: every row across the app that references a stored file
// (documents, workflow attachments, blueprints, revisions, design file sets,
// design-request files, budget documents, expense receipts, procurement
// delivery receipts), checked against the CONFIGURED storage backend
// (storage.open(), same code the "View document" dialog uses) to find which
// ones are actually missing. Changes nothing.
//
// Run with the same env as the server you want to check (S3_* for Filebase,
// or none for local disk): npm run check:files --workspace=@easyconstruct/api
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface Row {
  table: string;
  id: string;
  label: string;
  project: string | null;
  url: string;
}

async function main() {
  const { storage } = await import("../../src/core/storage/index.js");
  const q = async <T = any>(sql: string) => (await pool.query(sql)).rows as T[];

  const rows: Row[] = [
    ...(await q<Row>(
      `SELECT 'documents' AS table, document_id AS id, title AS label, project, file_url AS url FROM documents WHERE file_url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'workflow_attachments' AS table, wa.id::text AS id, wa.label, w.project_code AS project, wa.file_url AS url
       FROM workflow_attachments wa JOIN workflows w ON w.id = wa.workflow_id WHERE wa.file_url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'blueprints' AS table, id::text AS id, title AS label, project_code AS project, file_url AS url FROM blueprints WHERE file_url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'revisions' AS table, id::text AS id, item_title AS label, project_code AS project, file_url AS url FROM revisions WHERE file_url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'designs' AS table, d.code AS id, d.code AS label, d.project_code AS project, f ->> 'url' AS url
       FROM designs d, jsonb_array_elements(d.file_urls) f WHERE jsonb_array_length(d.file_urls) > 0`,
    )),
    ...(await q<Row>(
      `SELECT 'design_request_files' AS table, drf.id::text AS id, drf.filename AS label, dr.project_code AS project, drf.url AS url
       FROM design_request_files drf JOIN design_requests dr ON dr.id = drf.request_id`,
    )),
    ...(await q<Row>(
      `SELECT 'budget_documents' AS table, bd.id::text AS id, bd.name AS label, b.project AS project, bd.url AS url
       FROM budget_documents bd JOIN budgets b ON b.id = bd.budget_id WHERE bd.url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'expenses' AS table, id::text AS id, category AS label, project AS project, receipt_url AS url FROM expenses WHERE receipt_url IS NOT NULL`,
    )),
    ...(await q<Row>(
      `SELECT 'procurement_orders' AS table, id AS id, vendor AS label, project AS project, delivery_receipt_url AS url FROM procurement_orders WHERE delivery_receipt_url IS NOT NULL`,
    )),
  ];

  console.log(`Checking ${rows.length} file references (${new Set(rows.map((r) => r.url)).size} unique urls)...\n`);

  const checked = new Map<string, boolean>();
  const missing: Row[] = [];
  for (const row of rows) {
    if (!checked.has(row.url)) {
      try {
        const opened = await storage.open(row.url);
        opened.stream.destroy?.();
        checked.set(row.url, true);
      } catch {
        checked.set(row.url, false);
      }
    }
    if (checked.get(row.url) === false) missing.push(row);
  }

  if (missing.length === 0) {
    console.log("All referenced files are reachable on the configured storage backend.");
    return;
  }

  console.log(`${missing.length} of ${rows.length} file references point at a missing file:\n`);
  const byTable = new Map<string, Row[]>();
  for (const r of missing) byTable.set(r.table, [...(byTable.get(r.table) ?? []), r]);
  for (const [table, items] of byTable) {
    console.log(`-- ${table} (${items.length}) --`);
    for (const r of items) console.log(`  ${r.project ?? "-"}  ${r.id}  ${r.label}  [${r.url}]`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
