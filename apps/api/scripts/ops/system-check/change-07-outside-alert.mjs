// Change #7 - instant alert for outside-radius clock-ins. Run from apps/api/: node scripts/ops/system-check/change-07-outside-alert.mjs
import { call, check, finish } from "./change-lib.mjs";

const stamp = Date.now().toString(36).slice(-5);
// A fresh stretch of days on every run: one clock-in per employee per day is allowed.
const base = 5 + Math.floor(Math.random() * 3000);
const day = (back) => new Date(Date.now() - (base + back) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const projects = await call("admin", "GET", "/projects?limit=50");
const project = (projects.data?.items ?? projects.data).find((p) => p.status === "Construction" && p.siteLatitude != null);
check("found a Construction project with a site location", !!project, project?.code);
const lat = Number(project.siteLatitude);
const lng = Number(project.siteLongitude);

const photo = await call("site", "POST", "/uploads", { filename: `clock-${stamp}.png`, contentType: "image/png", dataUrl: PNG });
const clockIn = (extra) =>
  call("site", "POST", "/attendance", {
    employeeId: "EMP-DEMO-07",
    site: project.name,
    projectCode: project.code,
    clockIn: "08:05",
    photoUrl: photo.data.url,
    ...extra,
  });
const notesFor = async (who, needle) => ((await call(who, "GET", "/notifications")).data?.data ?? (await call(who, "GET", "/notifications")).data ?? []).filter((n) => (n.title ?? "").includes(needle) || (n.message ?? n.body ?? "").includes(needle));

// 1. Outside the radius (about 11 km north).
const outside = await clockIn({ logDate: day(1), latitude: lat + 0.1, longitude: lng, clientRequestId: `out-${stamp}` });
check("an outside clock-in is saved as Flagged", outside.status === 201 && outside.data?.status === "Flagged", `status ${outside.status} ${outside.data?.status}`);
const id = outside.data?.id;
const link = `/attendance?highlight=${id}`;
for (const who of ["pm", "hr", "admin"]) {
  const mine = (await notesFor(who, `/attendance?highlight=${id}`)).concat((await notesFor(who, "outside the site radius")).filter((n) => n.link === link));
  const unique = new Set(mine.filter((n) => n.link === link).map((n) => n.id));
  check(`${who} was notified straight away, once`, unique.size === 1, `${unique.size}`);
}
const sample = (await notesFor("hr", "outside the site radius")).find((n) => n.link === link);
check("the alert names the person, project, distance and time", /Rico|EMP-DEMO-07/.test(sample?.title + (sample?.message ?? sample?.body)) && (sample?.message ?? "").includes(project.code) && /\d+(\.\d)? km|\d+ m/.test(sample?.message ?? "") && (sample?.message ?? "").includes("08:05"), sample?.message);
check("it links to that attendance record on the HR attendance page", sample?.link === link);
check("people who should not hear about it do not (finance)", (await notesFor("finance", `highlight=${id}`)).filter((n) => n.link === link).length === 0);

// 2. Replaying the same offline entry creates no second notification.
const replay = await clockIn({ logDate: day(1), latitude: lat + 0.1, longitude: lng, clientRequestId: `out-${stamp}`, validatedOffline: true });
check("replaying the same queued entry returns the same record", replay.status === 201 && replay.data?.id === id, `status ${replay.status}`);
const afterReplay = new Set((await notesFor("hr", "outside the site radius")).filter((n) => n.link === link).map((n) => n.id));
check("a replay does not notify again (one notification per record)", afterReplay.size === 1);

// 3. An offline-synced clock-in outside the radius is included.
const offline = await clockIn({ logDate: day(2), latitude: lat, longitude: lng + 0.1, clientRequestId: `off-${stamp}`, validatedOffline: true });
check("an offline-synced outside clock-in is flagged", offline.status === 201 && offline.data?.status === "Flagged" && offline.data?.validatedOffline === true, `status ${offline.status}`);
const offLink = `/attendance?highlight=${offline.data?.id}`;
const offNote = (await notesFor("pm", "outside the site radius")).find((n) => n.link === offLink);
check("it alerts too, and says it was recorded offline", !!offNote && /offline/i.test(offNote.message ?? ""), offNote?.message);

// 4. Inside the radius: no alert.
const inside = await clockIn({ logDate: day(3), latitude: lat, longitude: lng, clientRequestId: `in-${stamp}` });
check("an inside clock-in is Verified", inside.status === 201 && inside.data?.status === "Verified", inside.data?.status);
check("and sends no alert", (await notesFor("hr", "outside the site radius")).filter((n) => n.link === `/attendance?highlight=${inside.data?.id}`).length === 0);
finish();
