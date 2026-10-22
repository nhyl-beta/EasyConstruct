// Responsive audit crawler (dev tool, not shipped).
//
// Signs in as one demo account per role, collects every sidebar link, visits each
// page at each target width and records pages that scroll horizontally, plus the
// elements that stick out past the viewport (ignoring anything inside its own
// overflow-x scroll container). Run against the LOCAL stack only:
//
//   $env:CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
//   node apps/web/scripts/responsive-audit.mjs [role,role] [widths] > out.json
//
// Needs the web dev server (5173) and a local API with the seeded demo accounts.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const WEB = process.env.WEB_BASE ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Demo@12345";

const ACCOUNTS = {
  owner: "nhylcyrusgervasio@gmail.com",
  admin: "admin1@easyconstruct.demo",
  "it-designer": "itdesigner1@easyconstruct.demo",
  "project-manager": "pm@easyconstruct.demo",
  "human-resources": "hr@easyconstruct.demo",
  "finance-manager": "finance@easyconstruct.demo",
  architect: "architect1@easyconstruct.demo",
  engineer: "engineer1@easyconstruct.demo",
  consultant: "consultant1@easyconstruct.demo",
  "site-personnel": "site@easyconstruct.demo",
};

const VIEWPORTS = [
  { w: 360, h: 800, label: "360" },
  { w: 390, h: 844, label: "390" },
  { w: 768, h: 1024, label: "768" },
  { w: 1024, h: 768, label: "768-land" },
  { w: 820, h: 1180, label: "820" },
  { w: 1180, h: 820, label: "820-land" },
  { w: 1024, h: 1366, label: "1024" },
  { w: 1280, h: 800, label: "1280" },
  { w: 1536, h: 864, label: "1536" },
];

const roles = (process.argv[2] ?? Object.keys(ACCOUNTS).join(",")).split(",");
const wanted = (process.argv[3] ?? VIEWPORTS.map((v) => v.label).join(",")).split(",");
const viewports = VIEWPORTS.filter((v) => wanted.includes(v.label));
const extraRoutes = ["/settings"];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function login(role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", ACCOUNTS[role]);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForTimeout(1500);
  // Navigation is click-driven (no <a href>), so walk the sidebar buttons and header tabs
  // and record where each one lands. Two passes so groups opened by pass 1 get visited.
  const routes = new Set(["/"]);
  for (let pass = 0; pass < 2; pass++) {
    const sel = "[data-sidebar=menu-button], [data-sidebar=menu-sub-button], header + nav button, nav button";
    const count = await page.locator(sel).count();
    for (let i = 0; i < count; i++) {
      const el = page.locator(sel).nth(i);
      const before = new URL(page.url()).pathname;
      try { await el.click({ timeout: 2000 }); } catch { continue; }
      await page.waitForTimeout(350);
      const after = new URL(page.url()).pathname;
      if (after !== before || pass === 0) routes.add(after);
      if (after.startsWith("/login")) break;
    }
  }
  routes.delete("/login");
  const state = await ctx.storageState();
  await ctx.close();
  return { routes: [...routes], state };
}

// Runs inside the page. Returns overflow facts for the current layout.
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const scrollsInside = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  const sel = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${el.textContent ? ` "${el.textContent.trim().slice(0, 30)}"` : ""}`;
  };
  const offenders = [];
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && !scrollsInside(el)) offenders.push({ s: sel(el), right: Math.round(r.right), w: Math.round(r.width) });
    // an element clipped by an overflow:hidden ancestor on the right = unreachable content
    if (r.right > vw + 1 && scrollsInside(el)) {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "hidden" || ox === "clip") {
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + 2 && r.left < pr.right) clipped.push({ s: sel(el), by: sel(p) });
          break;
        }
        if (ox === "auto" || ox === "scroll") break;
      }
    }
  }
  const small = [...document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select")].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && cs.display !== "none" && cs.visibility !== "hidden" && (r.height < 32 || r.width < 32) && !el.closest("[data-sidebar=menu-sub]");
  }).length;
  const inputsSmallFont = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16;
  }).length;
  const headerH = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
  return {
    vw, docW, overflow: docW > vw + 1,
    offenders: offenders.slice(0, 6), offenderCount: offenders.length,
    clipped: clipped.slice(0, 4), clippedCount: clipped.length,
    small, inputsSmallFont, headerH: Math.round(headerH),
    err: document.body.innerText.includes("Something went wrong") || /Application error/i.test(document.body.innerText),
  };
};

const results = [];
for (const role of roles) {
  let session;
  try {
    session = await login(role);
  } catch (e) {
    console.error(`login failed for ${role}: ${e.message}`);
    results.push({ role, route: "(login)", vp: "-", error: String(e.message) });
    continue;
  }
  const routes = [...new Set([...session.routes, ...extraRoutes])];
  console.error(`${role}: ${routes.length} routes`);
  for (const vp of viewports) {
    const ctx = await browser.newContext({ storageState: session.state, viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: vp.w < 1024, isMobile: vp.w < 768 });
    const page = await ctx.newPage();
    for (const route of routes) {
      try {
        await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        // The notification SSE stream keeps the network busy, so "networkidle" never fires;
        // wait for the first content, then a fixed settle time for the data fetches.
        await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const m = await page.evaluate(measure);
        results.push({ role, route, vp: vp.label, ...m });
      } catch (e) {
        results.push({ role, route, vp: vp.label, error: String(e.message).slice(0, 120) });
      }
    }
    await ctx.close();
  }
}
await browser.close();
const out = process.env.AUDIT_OUT;
const json = JSON.stringify(results, null, 1);
if (out) writeFileSync(out, json);
else process.stdout.write(json);
