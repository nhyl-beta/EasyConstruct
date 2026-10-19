// apps/api/src/scripts/flag-advisory-without-file.ts — NEW (scope alignment, Task I)
//
// Lists advisory documents (uploaded by a Consultant) that have no usable
// file: file_url is empty, or is a placeholder rather than a stored path/URL.
// Read-only — nothing is deleted or changed. The Advisory Documents page shows
// these rows muted with a "No file attached" state.
//
// Run with: npx tsx src/scripts/flag-advisory-without-file.ts
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query<{
    document_id: string;
    title: string;
    project: string;
    type: string;
    uploaded_by: string;
    file_url: string | null;
    created_at: Date | null;
  }>(`
    SELECT d.document_id, d.title, d.project, d.type, d.uploaded_by, d.file_url, d.created_at
      FROM documents d
     WHERE EXISTS (
             SELECT 1 FROM users u
              WHERE u.role = 'consultant'
                AND (lower(u.email) = lower(d.uploaded_by) OR lower(u.name) = lower(d.uploaded_by))
           )
       AND (d.file_url IS NULL
            OR btrim(d.file_url) = ''
            OR (d.file_url NOT LIKE '/%' AND d.file_url NOT LIKE 'http%'))
     ORDER BY d.created_at DESC NULLS LAST
  `);

  if (rows.length === 0) {
    console.log("No advisory documents without a file.");
    return;
  }
  console.log(`${rows.length} advisory document(s) with no file attached:\n`);
  for (const r of rows) {
    const when = r.created_at ? r.created_at.toISOString().slice(0, 10) : "unknown date";
    console.log(`  ${r.document_id}  ${r.project}  ${r.type}  "${r.title}"  by ${r.uploaded_by}  (${when})  file_url=${r.file_url ?? "NULL"}`);
  }
  console.log("\nNothing was changed. Ask the consultant to re-upload with a file, or remove the record from the Documents page.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
