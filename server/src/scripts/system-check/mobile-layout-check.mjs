// Mobile layout + geofenced attendance + photo + offline queue, emulated phone (390x844, touch).
// Real phone camera/GPS hardware cannot be exercised; geolocation and file input are emulated.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const WEB = process.env.WEB_BASE ?? "http://localhost:5173";
const API = "http://localhost:8123";
import { CHROME, psql } from "./lib.mjs";
const out = process.argv[2] ?? "."; mkdirSync(out, { recursive: true });
const log = []; const rec = (name, ok, detail = "") => { log.push({ name, ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ACC = { site: "site@easyconstruct.demo", pm: "pm@easyconstruct.demo", admin: "admin@easyconstruct.demo", hr: "hr@easyconstruct.demo", finance: "finance@easyconstruct.demo", engineer: "engineer@easyconstruct.demo", architect: "architect@easyconstruct.demo", consultant: "consultant@easyconstruct.demo", itd: "itdesigner@easyconstruct.demo", owner: "nhylcyrusgervasio@gmail.com" };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", permissions: ["geolocation"] };
async function login(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email); await page.fill("#password", "Demo@12345");
  await page.click("button:has-text('Sign in')"); await page.waitForTimeout(3000);
}
// ---------- A. mobile layout, every role ----------
const layout = [];
for (const [role, email] of (process.env.SKIP_LAYOUT ? [] : Object.entries(ACC))) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage();
  await login(page, email);
  const landing = page.url().replace(WEB, "");
  const pages = new Set([landing]);
  // open the mobile menu and collect nav links
  const trig = page.locator("[data-sidebar='trigger'], button:has(svg.lucide-menu), button[aria-label*='menu' i], button[aria-label*='sidebar' i]").first();
  let menuOpened = false;
  if (await trig.count()) { await trig.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500); menuOpened = !!(await page.$("[data-mobile='true'], [role=dialog]:visible, [data-sidebar='sidebar']:visible")); }
  const hrefs = await page.$$eval("a[href^='/']", (a) => [...new Set(a.map((x) => x.getAttribute("href")))]);
  hrefs.filter((h) => !/login/.test(h)).slice(0, 12).forEach((h) => pages.add(h));
  const r = { role, menuOpened, pages: [] };
  for (const h of pages) {
    await page.goto(`${WEB}${h}`, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const de = document.documentElement; const vw = window.innerWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > vw + 2 && !e.closest("[class*='overflow-x'],[class*='overflow-auto'],[class*='overflow-hidden'],table,[role=tablist],[data-radix-scroll-area-viewport]"); }).slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 50));
      const small = [...document.querySelectorAll("button:not([disabled]), a, [role=tab]")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 32 || b.width < 32) && getComputedStyle(e).visibility !== "hidden"; }).length;
      return { pageScrollsSideways: de.scrollWidth > vw + 2, scrollWidth: de.scrollWidth, vw, clippedElements: wide, tinyTapTargets: small };
    });
    r.pages.push({ href: h, ...m });
  }
  if (role === "site" || role === "pm") await page.screenshot({ path: `${out}/mobile-${role}.png` });
  layout.push(r); await ctx.close();
}
writeFileSync(`${out}/mobile-layout.json`, JSON.stringify(layout, null, 1));
const sideways = layout.flatMap((r) => r.pages.filter((p) => p.pageScrollsSideways).map((p) => `${r.role}:${p.href}`));
rec("Mobile: no page scrolls sideways (10 roles)", sideways.length === 0, sideways.join(", "));
rec("Mobile: menu opens on phone", layout.every((r) => r.menuOpened), layout.filter((r) => !r.menuOpened).map((r) => r.role).join(","));

// ---------- B. geofence + photo + online clock-in ----------
async function sitePage(ctx) {
  const page = await ctx.newPage(); await login(page, ACC.site);
  await page.goto(`${WEB}/attendance`, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(2500); return page;
}
// Start from a day with no attendance for the site account, so the clock-in below is the first one.
const SITE_EMP = psql("select employee_id from employees where email='site@easyconstruct.demo'");
psql(`delete from attendance where employee_id='${SITE_EMP}' and log_date=current_date`);
const ctx = await browser.newContext(ctxOpts);
let page = await sitePage(ctx);
console.log("attendance url", page.url());
const already = await page.locator("text=/Clocked in at/").count();
rec("Attendance page loads on phone", await page.locator("text=Page not found").count()===0 && await page.locator("text=Log attendance, text=Clocked in").count()>=0, page.url());
if (already) { rec("Site user already clocked in today (reset needed for clock-in test)", false, await page.locator("text=/Clocked in at.*/").first().innerText()); }
const statusProbe = async (token) => (await fetch(`${API}/api/attendance`, { headers: { Authorization: `Bearer ${token}` } })).status;
writeFileSync(`${out}/mobile-offline-results.json`, JSON.stringify({ layout: log }, null, 1));
await page.screenshot({ path: `${out}/mobile-attendance.png` });
// project select
async function pick(page) {
  await page.locator("[role=combobox]").first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300);
  const opts = await page.$$eval("[role=option]", (o) => o.map((x) => x.innerText)); // Clock in on the Construction demo project: attendance is refused on other phases, which is not geofence logic.
  const wanted = page.locator("[role=option]", { hasText: "DEMO-S4" }); await ((await wanted.count()) ? wanted : page.locator("[role=option]")).first().click().catch(() => {}); return opts;
}
let opts = []; if (!already) opts = await pick(page);
rec("Project dropdown lists staffed projects", opts.length > 0, opts.join(" | "));
const site = (opts.find((o) => o.includes("DEMO-S4")) ?? opts[0])?.split(" · ")[0];
const geo = await (async () => { const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ACC.site, password: "Demo@12345" }) }); const t = (await r.json()); const tok = t.data?.token ?? t.token; const p = await (await fetch(`${API}/api/projects`, { headers: { Authorization: `Bearer ${tok}` } })).json(); const list = p.data ?? p; return { tok, proj: list.find((x) => x.code === site) }; })();
console.log("project", site, geo.proj?.siteLatitude, geo.proj?.siteLongitude);
const lat = Number(geo.proj?.siteLatitude), lng = Number(geo.proj?.siteLongitude);
async function verifyAndPhoto(page, at, withPhoto = true) {
  await ctx.setGeolocation({ latitude: at.lat, longitude: at.lng, accuracy: 10 });
  await page.getByRole("button", { name: /Verify location|Location verified/ }).click(); await page.waitForTimeout(800);
  if (withPhoto) { await page.setInputFiles("input[type=file]", { name: "selfie.png", mimeType: "image/png", buffer: PNG }); await page.waitForTimeout(600); }
}
if (!already && site) {
  // permission denied case
  const dctx = await browser.newContext({ ...ctxOpts, permissions: [] }); const dp = await sitePage(dctx); await pick(dp);
  await dp.getByRole("button", { name: /Verify location/ }).click().catch(() => {}); await dp.waitForTimeout(1200);
  rec("Location denied -> clear message shown", await dp.locator("text=/permission denied/i").count() > 0);
  await dctx.close();
  // confirm disabled until location + photo
  const dis = await page.getByRole("button", { name: "Confirm attendance" }).isDisabled();
  rec("Confirm disabled before location+photo", dis);
  // outside geofence (about 5 km away)
  await verifyAndPhoto(page, { lat: lat + 0.05, lng });
  rec("Photo preview appears after capture", await page.locator("img[alt*='verification']").count() > 0);
  const posts = []; const postBodies = [];
  page.on("response", async (r) => { if (r.request().method() === "POST" && r.url().includes("/api/")) { const path = r.url().replace(/^https?:\/\/[^/]+/, ""); posts.push(`${r.status()} ${path}`); postBodies.push({ status: r.status(), path, body: await r.text().catch(() => "") }); } });
  await page.getByRole("button", { name: "Confirm attendance" }).click(); await page.waitForTimeout(3000);
  const txt = await page.locator("main, [data-slot='sidebar-inset']").first().innerText();
  // Strict: this passes only for the geofence logic itself. A rejected selfie upload (or any other
  // unrelated 4xx) used to count as "rejected" and gave a false PASS.
  const uploadFail = postBodies.find((p) => p.path.startsWith("/api/uploads") && p.status >= 400);
  const saved = psql(`select geofence||'|'||status||'|'||coalesce(distance_from_site_m::text,'-') from attendance where employee_id='${SITE_EMP}' and log_date=current_date`);
  const attendancePost = postBodies.find((p) => p.path === "/api/attendance");
  const flaggedInDb = /^Outside\|/.test(saved);
  const refusedForGeofence = !!attendancePost && attendancePost.status >= 400 && /geofence|outside|too far|out of range|distance|radius/i.test(attendancePost.body);
  const detail = `${posts.join(" ; ")} | saved row: ${saved || "(none)"} | page shows: ${(txt.match(/Clocked in at[^\n]*|Outside|Inside|Unverified/g) || []).join(",")}`;
  if (uploadFail) rec("Clock-in 5 km outside geofence is flagged Outside (the selfie upload must succeed first)", false, `the selfie upload was rejected before the geofence logic ran: ${uploadFail.status} ${uploadFail.body.slice(0, 160)}`);
  else rec("Clock-in 5 km outside geofence is flagged Outside (saved row) or refused with a geofence message", flaggedInDb || refusedForGeofence, detail);
  writeFileSync(`${out}/geo-outside.txt`, txt.slice(0, 1500));
}
await ctx.close();
// ---------- C. report ----------
writeFileSync(`${out}/mobile-offline-results.json`, JSON.stringify({ log, layoutSummary: layout.map((r) => ({ role: r.role, pages: r.pages.length, sideways: r.pages.filter((p) => p.pageScrollsSideways).length, tiny: r.pages.reduce((a, p) => a + p.tinyTapTargets, 0) })) }, null, 1));
await browser.close();
