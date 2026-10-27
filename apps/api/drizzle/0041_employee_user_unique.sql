-- One account maps to at most one employee record. employees.user_id stays nullable (roster-only employees have no
-- login), so the index is partial. ADDITIVE ONLY; no rows are changed. If two employees already point at the same
-- account, this fails with a message listing them rather than guessing which one to keep.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(format('user_id %s: employees %s', user_id, ids), '; ') INTO dupes
  FROM (
    SELECT user_id, string_agg(employee_id, ', ' ORDER BY id) AS ids
    FROM employees
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
  ) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add the unique employee-account link: several employees share one account (%). Clear employees.user_id on the extra rows, then run the migration again.', dupes;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employees_user_id_uq" ON "employees" ("user_id") WHERE "user_id" IS NOT NULL;
