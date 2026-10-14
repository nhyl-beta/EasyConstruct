// UI pass: one browser context per role. For every sidebar page: load it, record console/page/API errors,
// click every safe control, and for every dialog that opens try (A) empty submit, (B) filled submit
// incl. a file upload. Destructive-looking controls are never clicked; confirmation dialogs are cancelled.
// usage: node ui-check.mjs <outDir> [role,role,...]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const WEB = process.env.WEB_BASE ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const outDir = process.argv[2] ?? ".";
const only = process.argv[3]?.split(",");
mkdirSync(`${outDir}/shots`, { recursive: true });

const ACCOUNTS = {
  owner: "nhylcyrusgervasio@gmail.com", admin: "admin@easyconstruct.demo", "it-designer": "itdesigner@easyconstruct.demo",
  "project-manager": "pm@easyconstruct.demo", hr: "hr@easyconstruct.demo", finance: "finance@easyconstruct.demo",
  architect: "architect@easyconstruct.demo", engineer: "engineer@easyconstruct.demo", site: "site@easyconstruct.demo",
  consultant: "consultant@easyconstruct.demo",
};
const NOISE = /fonts\.googleapis|fonts\.gstatic|telemetry\.refine|ERR_TUNNEL|tile\.openstreetmap|nominatim|unpkg|cdn\./i;
const DESTRUCTIVE = /delete|remove|archive|reject|decline|deny|revoke|deactivate|terminate|sign ?out|log ?out|reset|clear all|discard|void|cancel (project|workflow)|close project|confirm|approve|release|post payroll|finalize|publish|send|import all|wipe/i;
const CREATEISH = /new|create|add|upload|report|request|log |record|draft|schedule|file|submit|raise|assign|propose|invite|register|enroll/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function runRole(browser, role, email) {
  const res = { role, email, pages: [], loginOk: false };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let bucket = null; // current page record
  const touch = () => bucket ?? { consoleErrors: [], pageErrors: [], api: [] };
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text()) && !NOISE.test(m.location()?.url ?? "")) touch().consoleErrors.push(m.text().slice(0, 240)); });
  page.on("pageerror", (e) => touch().pageErrors.push(String(e.message).slice(0, 240)));
  page.on("response", (r) => {
    const u = r.url();
    if (!u.includes("/api/") || u.includes("/notifications/stream")) return;
    const path = u.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    touch().api.push({ m: r.request().method(), path, s: r.status() });
  });

  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", "Demo@12345");
  await page.click("button:has-text('Sign in')");
  await page.waitForTimeout(3500);
  res.landing = page.url().replace(WEB, "");
  res.loginOk = !/\/login/.test(page.url());
  if (!res.loginOk) { res.loginError = (await page.innerText("body").catch(() => "")).slice(0, 200); await ctx.close(); return res; }

  // Sidebar entries are buttons that navigate on click (no hrefs): click each, record where it lands.
  const MENU = "[class*='menu-button']";
  const seen = new Map(); // label -> href
  const landing = page.url();
  for (let round = 0; round < 4; round++) {
    const btns = await page.$$(MENU);
    let progressed = false;
    for (let i = 0; i < btns.length; i++) {
      const fresh = await page.$$(MENU);
      const b = fresh[i]; if (!b) continue;
      const label = ((await b.innerText().catch(() => "")) || (await b.getAttribute("aria-label").catch(() => "")) || `item-${i}`).trim().replace(/\s+/g, " ");
      if (!label || seen.has(label) || /sign ?out|log ?out/i.test(label)) continue;
      const before = page.url();
      await b.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      seen.set(label, page.url().replace(WEB, ""));
      progressed = true;
      if (page.url() !== before) { /* navigated: sidebar persists */ }
    }
    if (!progressed) break;
  }
  res.sidebar = Object.fromEntries(seen);
  await page.goto(landing, { waitUntil: "domcontentloaded" });
  const targets = [...new Set([res.landing, ...seen.values()])].filter((h) => h && !/login|logout/.test(h));
  res.sidebarLinks = targets.length;

  for (const href of targets) {
    const rec = { href, loadOk: true, consoleErrors: [], pageErrors: [], api: [], clicks: 0, dialogs: [], iconButtonsWithoutLabel: 0, notes: [] };
    bucket = rec;
    try {
      await page.goto(`${WEB}${href}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2200);
      const text = (await page.innerText("body").catch(() => "")).trim();
      rec.textLength = text.length;
      if (/something went wrong|unexpected error|cannot read prop|is not a function|application error|404|not found/i.test(text.slice(0, 600)) && text.length < 800) rec.notes.push(`error-looking page: "${text.slice(0, 120).replace(/\n+/g, " | ")}"`);
      if (text.length < 60) rec.notes.push("page looks blank");
      rec.interactables = (await pageControls(page)).length;

      // safe control sweep: click each not-yet-clicked safe control; come back to the page after any navigation
      const clicked = new Set();
      for (let guard = 0; guard < 40 && rec.clicks < 25; guard++) {
        const handles = await pageControls(page);
        const occ = new Map();
        let target = null, label = "";
        for (const h of handles) {
          const l = ((await h.innerText().catch(() => "")) || (await h.getAttribute("aria-label").catch(() => "")) || "").trim().replace(/\s+/g, " ");
          if (!l) { continue; }
          const k = `${l}#${occ.set(l, (occ.get(l) ?? 0) + 1).get(l)}`;
          if (clicked.has(k)) continue;
          clicked.add(k);
          if (DESTRUCTIVE.test(l) || /^(go to|toggle|\d+$)/i.test(l)) continue;
          if (await h.isDisabled().catch(() => true)) continue;
          target = h; label = l; break;
        }
        if (!target) break;
        rec.clicks++;
        const before = page.url();
        await target.click({ timeout: 2500 }).catch(() => {});
        await page.waitForTimeout(600);
        const dlg = await page.$("[role=dialog]:visible, [role=alertdialog]:visible");
        if (dlg) {
          const isAlert = (await dlg.getAttribute("role")) === "alertdialog";
          const title = ((await dlg.$eval("h1,h2,h3,[data-slot=dialog-title],[id*=title]", (e) => e.innerText).catch(() => "")) || label).trim().slice(0, 80);
          const d = { opener: label, title, kind: isAlert ? "confirm" : "form", fields: 0, emptySubmit: null, filledSubmit: null };
          if (!isAlert && !DESTRUCTIVE.test(title)) {
            d.fields = await dlg.$$eval("input:not([type=hidden]), textarea, select, [role=combobox]", (e) => e.length);
            const primary = await findPrimary(dlg);
            if (primary && d.fields > 0) {
              const mark = rec.api.length;
              await primary.click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(900);
              const still = !!(await page.$("[role=dialog]:visible"));
              const invalid = await page.$$eval("[role=dialog] [aria-invalid=true], [role=dialog] .text-destructive, [role=dialog] [role=alert]", (e) => e.length).catch(() => 0);
              const calls = rec.api.slice(mark).filter((c) => c.m !== "GET");
              d.emptySubmit = { dialogStayedOpen: still, validationMessages: invalid, writeCalls: calls.map((c) => `${c.m} ${c.path} ${c.s}`) };
              if (calls.some((c) => c.s >= 500)) rec.notes.push(`5xx on EMPTY submit of "${title}"`);
              if (still && CREATEISH.test(`${title} ${label}`)) {
                const live = await page.$("[role=dialog]:visible") ?? dlg;
                await fillDialog(page, live);
                const mark2 = rec.api.length;
                const p2 = await findPrimary(await page.$("[role=dialog]:visible") ?? live);
                if (p2) await p2.click({ timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(1800);
                const calls2 = rec.api.slice(mark2).filter((c) => c.m !== "GET");
                const closed = !(await page.$("[role=dialog]:visible"));
                d.filledSubmit = { dialogClosed: closed, writeCalls: calls2.map((c) => `${c.m} ${c.path} ${c.s}`) };
                if (calls2.some((c) => c.s >= 500)) rec.notes.push(`5xx on FILLED submit of "${title}"`);
                if (calls2.some((c) => c.s >= 400 && c.s < 500)) rec.notes.push(`4xx on FILLED submit of "${title}": ${calls2.filter((c) => c.s >= 400).map((c) => `${c.m} ${c.path} ${c.s}`).join(", ")}`);
              }
            }
          }
          rec.dialogs.push(d);
          await page.keyboard.press("Escape"); await page.waitForTimeout(250);
          if (await page.$("[role=dialog]:visible, [role=alertdialog]:visible")) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
        }
        if (page.url() !== before) { await page.goto(`${WEB}${href}`, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(1200); }
      }
    } catch (e) { rec.loadOk = false; rec.notes.push(`navigation/interaction error: ${String(e.message).slice(0, 160)}`); }
    if (rec.api.some((c) => c.s >= 500) || rec.pageErrors.length) await page.screenshot({ path: `${outDir}/shots/${role}${href.replace(/\//g, "_")}.png` }).catch(() => {});
    bucket = null;
    res.pages.push(rec);
  }
  await ctx.close();
  return res;
}


// Every visible button/tab outside the sidebar and the global header chrome (sidebar toggle, theme, bell, user menu).
async function pageControls(page) {
  const all = await page.$$("button:visible, [role=tab]:visible");
  const keep = [];
  for (const h of all) {
    const ok = await h.evaluate((e) => {
      if (!e.closest("[data-slot='sidebar-inset']")) return false;
      const t = (e.innerText || e.getAttribute("aria-label") || "").trim();
      if (/^toggle (sidebar|theme)/i.test(t) || /^\d+\+?$/.test(t) || /^[A-Z]{2}$/.test(t)) return false;
      if (e.closest("[role=dialog]")) return false;
      return true;
    }).catch(() => false);
    if (ok) keep.push(h);
  }
  return keep;
}

async function findPrimary(root) {
  const btns = await root.$$("button:visible");
  for (const b of btns.reverse()) {
    const t = ((await b.innerText().catch(() => "")) || "").trim();
    if (t && !/cancel|close|back|previous|reset/i.test(t) && !(await b.isDisabled().catch(() => false))) return b;
  }
  return null;
}

async function fillDialog(page, dlg) {
  const inputs = await dlg.$$("input:visible:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea:visible");
  for (const el of inputs) {
    const type = (await el.getAttribute("type")) ?? "text";
    const ph = (await el.getAttribute("placeholder")) ?? "";
    try {
      if (type === "file") { await el.setInputFiles({ name: "ui-check.png", mimeType: "image/png", buffer: PNG }); continue; }
      if (type === "number") await el.fill("100");
      else if (type === "date") await el.fill(new Date().toISOString().slice(0, 10));
      else if (type === "email") await el.fill("ui-check@example.com");
      else if (type === "tel") await el.fill("09171234567");
      else await el.fill(`UI check ${ph || "text"}`.slice(0, 60));
    } catch {}
  }
  const files = await dlg.$$("input[type=file]");
  for (const f of files) await f.setInputFiles({ name: "ui-check.png", mimeType: "image/png", buffer: PNG }).catch(() => {});
  const combos = await dlg.$$("[role=combobox]:visible");
  for (const c of combos) {
    await c.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(250);
    const opt = await page.$("[role=option]:visible");
    if (opt) await opt.click().catch(() => {}); else await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  const selects = await dlg.$$("select:visible");
  for (const s of selects) { const v = await s.$$eval("option", (o) => o.map((x) => x.value).filter(Boolean)); if (v[0]) await s.selectOption(v[0]).catch(() => {}); }
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const roles = Object.entries(ACCOUNTS).filter(([r]) => !only || only.includes(r));
const results = [];
const queue = [...roles];
await Promise.all([0, 1, 2].map(async () => {
  while (queue.length) {
    const [role, email] = queue.shift();
    const t0 = Date.now();
    try { results.push(await runRole(browser, role, email)); } catch (e) { results.push({ role, email, fatal: String(e.message) }); }
    console.log(`done ${role} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
await browser.close();
writeFileSync(`${outDir}/ui-results.json`, JSON.stringify(results, null, 1));
console.log("wrote ui-results.json");
