// Action pass: clicks the buttons ui-check.mjs deliberately skips (approve, reject, confirm, delete, send, ...),
// confirms/fills the dialogs they open, and records the server answer plus what the user sees (toast).
// LOCAL THROWAWAY DATABASE ONLY - it really approves, rejects and deletes data.
// usage: node action-check.mjs <outDir> [role,role,...]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { preflightApi, failIfBrowserLoginsFailed } from "./lib.mjs";
await preflightApi();

const WEB = process.env.WEB_BASE ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const outDir = process.argv[2] ?? ".";
const only = process.argv[3]?.split(",");
mkdirSync(outDir, { recursive: true });

const ACCOUNTS = {
  owner: "nhylcyrusgervasio@gmail.com", admin: "admin@easyconstruct.demo", "it-designer": "itdesigner@easyconstruct.demo",
  "project-manager": "pm@easyconstruct.demo", hr: "hr@easyconstruct.demo", finance: "finance@easyconstruct.demo",
  architect: "architect@easyconstruct.demo", engineer: "engineer@easyconstruct.demo", site: "site@easyconstruct.demo",
  consultant: "consultant@easyconstruct.demo",
};
const NOISE = /fonts\.g|telemetry\.refine|ERR_TUNNEL/i;
// buttons worth pressing here
const ACTION = /approve|reject|decline|return|revision|confirm|delete|remove|archive|send|release|finali[sz]e|submit|advance|complete|mark|acknowledge|escalate|cancel (task|request|rfi|workflow)|countersign|issue|publish|close|reopen|verify|flag|resolve/i;
// never pressed, even here (they end the session or wipe everything; sign-out is tested separately)
const NEVER = /sign ?out|log ?out|reset (all|demo|data)|wipe|clear all|toggle|^go to|deactivate all/i;
const MAX_PER_PAGE = 14;

async function labelOf(h) {
  return (((await h.innerText().catch(() => "")) || (await h.getAttribute("aria-label").catch(() => "")) || (await h.getAttribute("title").catch(() => "")) || "")).trim().replace(/\s+/g, " ");
}

async function contentButtons(page) {
  const all = await page.$$("button:visible, [role=menuitem]:visible");
  const keep = [];
  for (const h of all) {
    const ok = await h.evaluate((e) => {
      if (!e.closest("[data-slot='sidebar-inset']") && !e.closest("[role=menu]")) return false;
      if (e.closest("[role=dialog], [role=alertdialog]")) return false;
      const t = (e.innerText || e.getAttribute("aria-label") || "").trim();
      return !(/^\d+\+?$/.test(t) || /^[A-Z]{2}$/.test(t));
    }).catch(() => false);
    if (ok) keep.push(h);
  }
  return keep;
}

async function runRole(browser, role, email) {
  const res = { role, email, pages: [] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  let cur = null;
  page.on("response", async (r) => {
    const u = r.url(); if (!u.includes("/api/") || NOISE.test(u)) return;
    const m = r.request().method(); if (m === "GET" || !cur) return;
    let msg = ""; if (r.status() >= 400) msg = ((await r.json().catch(() => null))?.message ?? "").slice(0, 160);
    cur.writes.push({ m, path: u.replace(/^https?:\/\/[^/]+/, "").split("?")[0], s: r.status(), msg });
  });

  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email); await page.fill("#password", "Demo@12345");
  await page.click("button:has-text('Sign in')"); // Wait for the app to leave /login (a cold Vite compile or a slow machine took longer than a fixed 3.5 s
  // and made healthy accounts look like failed sign-ins); give up after 25 s.
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const landing = page.url().replace(WEB, "");
  // Still on the sign-in page: nothing below would mean anything for this role.
  if (/\/login/.test(page.url())) { await ctx.close(); return { role, email, loginFailed: true, pages: [] }; }
  // discover sidebar pages by clicking each entry
  const seen = new Map();
  for (let round = 0; round < 3; round++) {
    let progressed = false;
    const n = (await page.$$("[class*='menu-button']")).length;
    for (let i = 0; i < n; i++) {
      const b = (await page.$$("[class*='menu-button']"))[i]; if (!b) continue;
      const label = (await labelOf(b)) || `item-${i}`;
      if (seen.has(label) || /sign ?out|log ?out/i.test(label)) continue;
      await b.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(600);
      seen.set(label, page.url().replace(WEB, "")); progressed = true;
    }
    if (!progressed) break;
  }
  const targets = [...new Set([landing, ...seen.values()])].filter((h) => h && !/login/.test(h));

  for (const href of targets) {
    const rec = { href, actions: [] };
    await page.goto(`${WEB}${href}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
    const done = new Set();
    for (let guard = 0; guard < 40 && rec.actions.length < MAX_PER_PAGE; guard++) {
      let target = null, label = "";
      const occ = new Map();
      for (const h of await contentButtons(page)) {
        const l = await labelOf(h); if (!l) continue;
        const k = `${l}#${occ.set(l, (occ.get(l) ?? 0) + 1).get(l)}`;
        if (done.has(k)) continue;
        done.add(k);
        if (NEVER.test(l) || !ACTION.test(l)) continue;
        if (await h.isDisabled().catch(() => true)) continue;
        target = h; label = l; break;
      }
      if (!target) break;
      const act = { button: label, writes: [], dialog: null, toast: "" };
      cur = act;
      const before = page.url();
      await target.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      const dlg = await page.$("[role=alertdialog]:visible, [role=dialog]:visible");
      if (dlg) {
        act.dialog = ((await dlg.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 140);
        for (const el of await dlg.$$("textarea:visible, input:visible:not([type=hidden]):not([type=checkbox]):not([type=file])")) {
          const t = (await el.getAttribute("type")) ?? "text";
          try { await el.fill(t === "number" ? "10" : t === "date" ? new Date().toISOString().slice(0, 10) : "Action check: automated test reason"); } catch {}
        }
        for (const c of await dlg.$$("[role=combobox]:visible")) { await c.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(250); const o = await page.$("[role=option]:visible"); if (o) await o.click().catch(() => {}); else await page.keyboard.press("Escape"); }
        const btns = await dlg.$$("button:visible"); let primary = null;
        for (const b of btns.reverse()) { const t = await labelOf(b); if (t && !/cancel|close|back|no\b|keep/i.test(t) && !(await b.isDisabled().catch(() => false))) { primary = b; break; } }
        if (primary) { act.confirmed = await labelOf(primary); await primary.click({ timeout: 2500 }).catch(() => {}); }
        else act.confirmed = "(no enabled confirm button)";
      }
      await page.waitForTimeout(1600);
      act.toast = (await page.$$eval("[data-sonner-toast], [role=status], [data-radix-toast-root], li[data-type]", (e) => e.map((x) => x.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).slice(0, 200);
      cur = null;
      rec.actions.push(act);
      if (await page.$("[role=dialog]:visible, [role=alertdialog]:visible")) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
      if (page.url() !== before) { await page.goto(`${WEB}${href}`, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(1500); }
    }
    res.pages.push(rec);
  }

  // sign-out check: UI returns to /login, and the old token must stop working
  const token = await page.evaluate(() => { for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const v = s.getItem(s.key(i)); if (v && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) return v; } return null; });
  await page.goto(`${WEB}${landing}`, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(1500);
  await page.locator("button:has-text('Sign out')").first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2000);
  res.signOut = { redirectedToLogin: /\/login/.test(page.url()), tokenFound: !!token };
  if (token) { const r = await fetch("http://localhost:8123/api/notifications", { headers: { Authorization: `Bearer ${token}` } }); res.signOut.oldTokenStatusAfterLogout = r.status; }
  await ctx.close();
  return res;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const roles = Object.entries(ACCOUNTS).filter(([r]) => !only || only.includes(r));
const results = []; const queue = [...roles];
// sequential: actions change shared data, so roles must not race each other
while (queue.length) {
  const [role, email] = queue.shift(); const t0 = Date.now();
  try { results.push(await runRole(browser, role, email)); } catch (e) { results.push({ role, email, fatal: String(e.message) }); }
  console.log(`done ${role} in ${Math.round((Date.now() - t0) / 1000)}s`);
  writeFileSync(`${outDir}/action-results.json`, JSON.stringify(results, null, 1));
}
await browser.close();
console.log("wrote action-results.json");
failIfBrowserLoginsFailed(results);
