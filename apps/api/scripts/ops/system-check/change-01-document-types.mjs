// Change #1 - editable document types. Run: node scripts/ops/system-check/change-01-document-types.mjs
import { call, check, finish } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const list = await call("pm", "GET", "/reference/document-types");
check("anyone signed in can list the active types", list.status === 200 && Array.isArray(list.data) && list.data.length >= 16, `status ${list.status}, ${list.data?.length} types`);
check("Legal category seeded", ["Permit", "NDA", "Clearance", "Bond", "Insurance"].every((n) => list.data.some((t) => t.name === n && t.category === "Legal")));
const contract = list.data.find((t) => t.name === "Contract");
check("Contract is a system type", contract?.isSystem === true);

check("a PM cannot add a type", (await call("pm", "POST", "/reference/document-types", { name: `PM Type ${stamp}` })).status === 403);

const name = `Lease ${stamp}`;
const created = await call("admin", "POST", "/reference/document-types", { name, category: "Legal" });
check("Admin adds a type", created.status === 201 && created.data?.name === name, `status ${created.status}`);
check("duplicate (different case/spacing) is refused", (await call("itdesigner", "POST", "/reference/document-types", { name: name.toUpperCase().replace(" ", "  ") })).status === 409);
check("IT Designer may also write", (await call("itdesigner", "PATCH", `/reference/document-types/${created.data.id}`, { category: "Legal" })).status === 200);

const after = await call("site", "GET", "/reference/document-types");
check("the new type shows up for another role without a code change", after.data.some((t) => t.name === name));

const sys1 = await call("admin", "PATCH", `/reference/document-types/${contract.id}`, { name: "Agreement" });
check("system type cannot be renamed", sys1.status === 409 && sys1.body?.code === "SYSTEM_TYPE", `status ${sys1.status}`);
const sys2 = await call("admin", "PATCH", `/reference/document-types/${contract.id}`, { active: false });
check("system type cannot be deactivated", sys2.status === 409, `status ${sys2.status}`);

const projects = await call("admin", "GET", "/projects?limit=5");
const code = (projects.data?.items ?? projects.data)?.[0]?.projectCode ?? (projects.data?.items ?? projects.data)?.[0]?.code;
check("found a project to file against", !!code, String(code));

const docBody = (type) => ({ documentId: `T${stamp}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20), title: "Check doc", project: code, type, uploadedBy: "check", fileUrl: "/uploads/documents/x.txt" });
const ok = await call("admin", "POST", "/documents", docBody(name.toLowerCase()));
check("a document can be filed under the new type (stored with canonical spelling)", ok.status === 201 && ok.data?.type === name, `status ${ok.status} ${ok.body?.message ?? ""}`);

await call("admin", "PATCH", `/reference/document-types/${created.data.id}`, { active: false });
const bad = await call("admin", "POST", "/documents", docBody(name));
check("an inactive type is rejected for a new document", bad.status === 400, `status ${bad.status}`);
const unknown = await call("admin", "POST", "/documents", docBody("Napkin Sketch"));
check("an unknown type is rejected", unknown.status === 400, `status ${unknown.status}`);

const old = await call("admin", "GET", `/documents?project=${code}`);
const arr = Array.isArray(old.data) ? old.data : old.data?.items ?? [];
check("existing documents (including the inactive type) stay readable", old.status === 200 && arr.some((d) => d.type === name));

const legalFlag = await call("admin", "GET", "/reference/document-types?all=1");
check("writers see inactive types with ?all=1; others do not", legalFlag.data.some((t) => t.name === name) && !(await call("pm", "GET", "/reference/document-types?all=1")).data.some((t) => t.name === name));
finish();
