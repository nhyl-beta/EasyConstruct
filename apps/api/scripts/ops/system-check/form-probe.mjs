import { chromium } from "playwright";
import { CHROME } from "./lib.mjs";
const WEB = "http://localhost:5173";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const T = [
  ["engineer", "engineer@easyconstruct.demo", "/requests", "Raise request"],
  ["finance", "finance@easyconstruct.demo", "/budget", "Create budget"],
  ["finance", "finance@easyconstruct.demo", "/expenses", "Record expense"],
];
const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
for (const [role, email, path, opener] of T) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const writes = [];
  p.on("response", async (r) => { const u = r.url(); if (u.includes("/api/") && r.request().method() !== "GET") { let body = ""; if (r.status() >= 400) body = (await r.text().catch(() => "")).slice(0, 300); writes.push(`${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "")} ${r.status()} ${body}`); } });
  await p.goto(`${WEB}/login`); await p.fill("#email", email); await p.fill("#password", "Demo@12345"); await p.click("button:has-text('Sign in')"); await p.waitForTimeout(3000);
  await p.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  console.log(`\n=== ${role} ${path} "${opener}"`);
  const btn = p.locator(`button:has-text("${opener}")`).first();
  if (!(await btn.count())) { console.log("  opener not found"); await ctx.close(); continue; }
  await btn.click(); await p.waitForTimeout(900);
  const dlg = p.locator("[role=dialog]").first();
  if (!(await dlg.count())) { console.log("  no dialog opened"); await ctx.close(); continue; }
  // fill
  for (const el of await dlg.locator("input:visible:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea:visible").elementHandles()) {
    const type = (await el.getAttribute("type")) ?? "text";
    const label = await el.evaluate((e) => { const l = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`); const wrap = e.closest("div"); return ((l && l.innerText) || (wrap && wrap.innerText) || e.getAttribute("placeholder") || e.getAttribute("name") || "").toLowerCase().slice(0, 60); });
    try {
      if (/year/.test(label)) await el.fill("2026");
      else if (type === "number" || /amount|cost|price|budget|quantity|qty/.test(label)) await el.fill(/window|days|hours/.test(label) ? "10" : "5000");
      else if (type === "date") await el.fill(new Date().toISOString().slice(0, 10));
      else if (type === "email") await el.fill("ui-check@example.com");
      else await el.fill("UI check value");
    } catch {}
  }
  for (const f of await dlg.locator("input[type=file]").elementHandles()) await f.setInputFiles({ name: "ui-check.png", mimeType: "image/png", buffer: PNG }).catch(() => {});
  for (const c of await dlg.locator("[role=combobox]:visible").elementHandles()) { await c.click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(300); const o = p.locator("[role=option]:visible").first(); if (await o.count()) await o.click().catch(() => {}); else await p.keyboard.press("Escape"); await p.waitForTimeout(200); }
  console.log("  dialog text:", (await dlg.innerText()).replace(/\n+/g," | ").slice(0,420));
  const btns = await dlg.locator("button:visible").allInnerTexts();
  console.log("  buttons:", btns.map(t => t.trim()).filter(Boolean).join(" | "));
  const primary = dlg.locator("button:visible").filter({ hasNotText: /cancel|close|back|previous/i }).last();
  console.log("  primary:", (await primary.innerText()).trim(), "| disabled:", await primary.isDisabled());
  await primary.click({ timeout: 3000 }).catch((e) => console.log("  click failed:", e.message.slice(0, 80)));
  await p.waitForTimeout(2500);
  console.log("  writes:", writes.length ? "\n    " + writes.join("\n    ") : "(none)");
  const stillOpen = (await p.locator("[role=dialog]:visible").count()) > 0;
  console.log("  dialog still open:", stillOpen);
  if (stillOpen) {
    const msgs = await p.$$eval("[role=dialog] [role=alert], [role=dialog] .text-destructive, [role=dialog] [data-slot=form-message], [role=dialog] [id$=-message]", e => e.map(x => x.innerText.trim()).filter(Boolean));
    console.log("  validation text:", msgs.length ? msgs : "(none visible)");
    const inv = await p.$$eval("[role=dialog] [aria-invalid=true]", e => e.map(x => (x.getAttribute("name") || x.id || x.getAttribute("aria-label") || x.tagName)));
    console.log("  invalid fields:", inv);
    const empties = await p.$$eval("[role=dialog] input:not([type=hidden]):not([type=file]), [role=dialog] textarea, [role=dialog] [role=combobox]", els => els.filter(e => !(e.value || (e.innerText||"").replace(/select.*/i,"").trim().length>0 && e.getAttribute("role")==="combobox" && !/select|choose|pick/i.test(e.innerText))).map(e => e.getAttribute("name") || e.id || e.getAttribute("placeholder") || (e.innerText||"").trim().slice(0,25) || e.tagName).slice(0,12));
    console.log("  fields still empty:", empties);
  }
  await ctx.close();
}
await b.close();
