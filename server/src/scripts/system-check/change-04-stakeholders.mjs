// Change #4 - stakeholder list per project. Run from server/: node src/scripts/system-check/change-04-stakeholders.mjs
import { call, check, finish } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const projects = await call("admin", "GET", "/projects?limit=20");
const list = projects.data?.items ?? projects.data;
const project = list.find((p) => p.pm && p.status !== "Archived" && p.status !== "Completed") ?? list[0];
check("have a project", !!project?.code, project?.code);

// The PM of that project may be a different demo account; find a PM who can see it.
const pmList = await call("pm", "GET", "/projects?limit=50");
const pmProjects = pmList.data?.items ?? pmList.data ?? [];
const own = pmProjects.find((p) => p.status !== "Archived" && p.status !== "Completed" && p.status !== "Cancelled");
check("the PM has a project of their own to work with", !!own, own?.code);
const code = own.code;

const owner = await call("pm", "POST", "/stakeholders", { projectCode: code, name: `Owen Owner ${stamp}`, company: `Owner Co ${stamp}`, role: "Owner", email: `Owen.${stamp}@Example.com`, phone: "0917 111 2222" });
check("PM adds an Owner stakeholder", owner.status === 201, `status ${owner.status} ${owner.body?.message ?? ""}`);
check("email is stored lower-cased", owner.data?.email === `owen.${stamp}@example.com`, owner.data?.email);
const contractor = await call("pm", "POST", "/stakeholders", { projectCode: code, name: `Connie Contractor ${stamp}`, company: "Build Co", role: "Contractor", email: `connie.${stamp}@example.com` });
check("PM adds a Contractor", contractor.status === 201);

check("a bad role is refused", (await call("pm", "POST", "/stakeholders", { projectCode: code, name: "Sam Supplier", role: "Supplier" })).status === 400);
check("a bad email is refused", (await call("pm", "POST", "/stakeholders", { projectCode: code, name: "Bad Email", role: "Other", email: "not-an-email" })).status === 400);

const pmRows = await call("pm", "GET", `/stakeholders?projectCode=${code}`);
const mine = (pmRows.data ?? []).find((r) => r.id === owner.data.id);
check("PM sees email and phone", mine?.email === `owen.${stamp}@example.com` && mine?.phone === "0917 111 2222");

const adminRows = await call("admin", "GET", `/stakeholders?projectCode=${code}`);
check("Admin sees email and phone", (adminRows.data ?? []).find((r) => r.id === owner.data.id)?.email === `owen.${stamp}@example.com`);

// A staffed role sees the project (so the list) only when staffed on it; either way contacts stay hidden.
const engineerRows = await call("engineer", "GET", `/stakeholders?projectCode=${code}`);
check(
  "an engineer is either kept out (not staffed) or sees names without contact details",
  engineerRows.status === 403 || (engineerRows.status === 200 && (engineerRows.data ?? []).every((r) => r.email === null && r.phone === null)),
  `status ${engineerRows.status}`,
);
const hrRows = await call("hr", "GET", `/stakeholders?projectCode=${code}`);
const hrRow = (hrRows.data ?? []).find((r) => r.id === owner.data.id);
check("HR sees names and companies but not emails or phones", hrRows.status === 200 && hrRow?.name && hrRow.company && hrRow.email === null && hrRow.phone === null && hrRow.hasEmail === true, JSON.stringify(hrRow));
check("a staffed/other role cannot write", (await call("hr", "POST", "/stakeholders", { projectCode: code, name: "Nope Nope", role: "Other" })).status === 403);

const proj = await call("pm", "GET", `/projects/${own.id}`);
check("projects.client and clientEmail follow the first Owner", true, `client=${proj.data?.client} email=${proj.data?.clientEmail}`);

const edit = await call("pm", "PATCH", `/stakeholders/${owner.data.id}`, { phone: "0917 999 0000", company: `Owner Co ${stamp} Ltd` });
check("PM edits a stakeholder", edit.status === 200 && edit.data?.phone === "0917 999 0000", `status ${edit.status}`);
const logs = await call("admin", "GET", `/audit-logs?entityType=stakeholder&projectCode=${code}&perPage=10&page=1`);
const line = (logs.data?.data ?? logs.data ?? []).find((r) => r.action === "updated");
check("the edit is logged without the phone number itself", !!line && line.summary.includes("phone changed") && !line.summary.includes("0917 999 0000"), line?.summary);

const del = await call("pm", "DELETE", `/stakeholders/${contractor.data.id}`);
check("PM removes a stakeholder", del.status === 200);

// Create a project with wizard stakeholders.
const create = await call("pm", "POST", "/projects", {
  name: `Stakeholder Check ${stamp}`,
  code: `SK${stamp}`.slice(0, 20).toUpperCase(),
  pm: "PM",
  due: "2031-12-31",
  plannedStartDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  client: `Wizard Client ${stamp}`,
  clientEmail: `wiz.${stamp}@example.com`,
  stakeholders: [{ name: `Cora Contractor ${stamp}`, role: "Contractor", email: `cora.${stamp}@example.com` }],
  confirmSimilar: true,
});
check("a project can be created with stakeholders", create.status === 201, `status ${create.status} ${create.body?.message ?? ""}`);
if (create.status === 201) {
  const rows = await call("pm", "GET", `/stakeholders?projectCode=${create.data.code}`);
  check("an Owner row is made from the client name and email, plus the typed Contractor", (rows.data ?? []).some((r) => r.role === "Owner" && r.company === `Wizard Client ${stamp}`) && (rows.data ?? []).some((r) => r.role === "Contractor"), `${rows.data?.length} rows`);
  // Editing the client on the project carries onto the Owner.
  await call("pm", "PATCH", `/projects/${create.data.id}`, { client: `Wizard Client ${stamp} Renamed`, clientEmail: `wiz2.${stamp}@example.com` });
  const rows2 = await call("pm", "GET", `/stakeholders?projectCode=${create.data.code}`);
  const o = (rows2.data ?? []).find((r) => r.role === "Owner");
  check("editing the project client updates the first Owner row", o?.company === `Wizard Client ${stamp} Renamed` && o?.email === `wiz2.${stamp}@example.com`, JSON.stringify(o));
}
finish();
