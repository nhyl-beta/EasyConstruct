// Change #3 - log file downloads and project edits. Run: node src/scripts/system-check/change-03-audit-downloads-edits.mjs
import { API, call, check, finish, login } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const up = await call("admin", "POST", "/uploads", { filename: `check-${stamp}.png`, contentType: "image/png", dataUrl: PNG });
const url = up.data?.url;
check("uploaded a small file", up.status === 201 && !!url, `status ${up.status}`);

const projects = await call("admin", "GET", "/projects?limit=5");
const list = projects.data?.items ?? projects.data;
const project = list?.[0];
check("have a project", !!project?.id, project?.code);

// Plain file (no document): a download line with the file name and url.
const dl = await fetch(`${API}/uploads/file?url=${encodeURIComponent(url)}`, {
  headers: { Authorization: `Bearer ${await login("admin")}` },
});
check("the file downloads", dl.status === 200, `status ${dl.status}`);

// A Legal document (type Permit) and a normal one pointing at stored files.
const legalUp = await call("admin", "POST", "/uploads", { filename: `legal-${stamp}.png`, contentType: "image/png", dataUrl: PNG });
const mkDoc = (type, fileUrl, n) => call("admin", "POST", "/documents", { documentId: `L${stamp}${n}`, title: `Check ${type} ${stamp}`, project: project.code, type, uploadedBy: "check", fileUrl });
const legalDoc = await mkDoc("Permit", legalUp.data.url, "a");
check("created a Legal-category document", legalDoc.status === 201, `status ${legalDoc.status} ${legalDoc.body?.message ?? ""}`);
const field = await mkDoc("Field Report", url, "b");
check("created a normal document", field.status === 201);

const get = async (u) => {
  const r = await fetch(`${API}/uploads/file?url=${encodeURIComponent(u)}`, { headers: { Authorization: `Bearer ${await login("admin")}` } });
  return r.status;
};
check("legal file downloads", (await get(legalUp.data.url)) === 200);
check("normal document file downloads", (await get(url)) === 200);
check("a missing file is refused and logged", (await get("/uploads/generic/nope-does-not-exist.png")) === 404);

const logs = await call("admin", "GET", "/audit-logs?entityType=file&perPage=50&page=1");
const rows = logs.data?.data ?? logs.data ?? [];
const rowsArr = Array.isArray(rows) ? rows : rows.items ?? [];
const sensitive = rowsArr.find((r) => r.action === "sensitive_download" && r.summary?.includes(legalUp.data.url));
check("legal download is logged as sensitive with project, name and url", !!sensitive && sensitive.projectCode === project.code, sensitive?.summary?.slice(0, 120));
const normal = rowsArr.find((r) => r.action === "downloaded" && r.summary?.includes(url) && r.summary.includes(project.code));
check("normal download is logged with who, file and project", !!normal && normal.actor.length > 0, normal?.summary?.slice(0, 120));
check("refused download is logged", rowsArr.some((r) => r.action === "download_blocked" && r.summary.includes("nope-does-not-exist")));

const sec = await call("admin", "GET", "/audit-logs?actions=sensitive_download,download_blocked,integrity_failed,rejected,deleted");
const secRows = sec.data?.data ?? sec.data ?? [];
check("Security monitoring filter returns the sensitive download but not plain ones", (Array.isArray(secRows) ? secRows : []).some((r) => r.action === "sensitive_download") && !(Array.isArray(secRows) ? secRows : []).some((r) => r.action === "downloaded"));

// Project edit: changed fields only, old -> new.
const before = project.location ?? "";
const newLoc = `Check site ${stamp}`;
const patch = await call("admin", "PATCH", `/projects/${project.id}`, { location: newLoc, name: project.name });
check("project edit succeeds", patch.status === 200, `status ${patch.status} ${patch.body?.message ?? ""}`);
const pl = await call("admin", "GET", `/audit-logs?entityType=project&projectCode=${project.code}&perPage=5&page=1`);
const prow = (pl.data?.data ?? pl.data ?? []).find((r) => r.action === "updated" && r.summary.includes(newLoc));
check("project edit logged as old -> new", !!prow && prow.summary.includes("→") && prow.summary.includes("location:"), prow?.summary);
check("an unchanged field (name) is not in the line", !!prow && !prow.summary.includes("name:"));
// No-op edit writes nothing new.
const count1 = (await call("admin", "GET", `/audit-logs?entityType=project&projectCode=${project.code}&perPage=50&page=1`)).data;
await call("admin", "PATCH", `/projects/${project.id}`, { location: newLoc });
const count2 = (await call("admin", "GET", `/audit-logs?entityType=project&projectCode=${project.code}&perPage=50&page=1`)).data;
check("an edit that changes nothing leaves no log line", (count1?.data ?? count1).length === (count2?.data ?? count2).length);
await call("admin", "PATCH", `/projects/${project.id}`, { location: before || project.location });
finish();
