// The repository list joins each document to its employee and is ordered by employee name.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { employees } from "../../../core/db/schema/employees.js";
import { employeeDocuments } from "../../../core/db/schema/employee-documents.js";
import * as handlers from "./documents.js";

const code = `ZD${Date.now() % 1e8}`;
after(async () => {
  await db.delete(employees).where(eq(employees.employeeId, code)); // documents cascade
});

test("listAll returns each document with its employee's name, ID and department", async () => {
  const [emp] = await db.insert(employees).values({ employeeId: code, name: "Zz Docs Test", initials: "ZD", role: "x", department: "Design", site: "s", hiredOn: "2026-01-01" }).returning();
  await db.insert(employeeDocuments).values({ employeeId: emp!.id, docType: "resume", name: "cv.pdf", url: "/u/cv.pdf", uploadedBy: "t" });
  let body: { data: { employeeCode: string; employeeName: string; department: string; name: string }[] } | undefined;
  await handlers.listAll({} as never, { json: (b: never) => void (body = b) } as never, (e) => { throw e; });
  const mine = body!.data.filter((d) => d.employeeCode === code);
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0]!.employeeName, mine[0]!.department, mine[0]!.name], ["Zz Docs Test", "Design", "cv.pdf"]);
});
