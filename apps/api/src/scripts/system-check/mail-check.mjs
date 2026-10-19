import { chromium } from "playwright"; import { readFileSync, existsSync } from "node:fs";
import { CHROME } from "./lib.mjs";
const API = "http://localhost:8123/api", WEB = "http://localhost:5173";
const J = (p, body, tok) => fetch(API + p, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: JSON.stringify(body) });
const rec = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, "|", d);
const box = () => (existsSync("mailbox.json") ? JSON.parse(readFileSync("mailbox.json")) : []);
const login = async (email, pw) => { const r = await J("/auth/login", { email, password: pw }); const j = await r.json(); return { s: r.status, tok: j.data?.token ?? j.token }; };
const dec = (s) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const linkOf = (m) => dec(m.data).match(/https?:\/\/[^\s"<]+reset-password\?token=[^\s"<]+/)?.[0];
// 1 forgot password for HR
let r = await J("/auth/forgot-password", { email: "hr@easyconstruct.demo" }); rec("Forgot password accepted", r.status === 200, r.status);
await new Promise((s) => setTimeout(s, 1500)); let m = box().at(-1);
rec("Email delivered to the user's address", m?.to?.includes("hr@easyconstruct.demo"), JSON.stringify(m?.to));
rec("Subject + 30 min / one-time notice present", /Reset your EasyConstruct password/.test(m?.data) && /30 minutes/.test(dec(m.data)));
const link = linkOf(m); rec("Reset link points at the app", /^http:\/\/localhost:5173\/reset-password\?token=/.test(link || ""), (link || "").slice(0, 60));
// unknown address behaves the same (no enumeration)
const before = box().length; r = await J("/auth/forgot-password", { email: "nobody@nowhere.test" }); rec("Unknown address answers identically and sends nothing", r.status === 200 && box().length === before, r.status);
// 2 UI: open link, set a new password
const token = new URL(link).searchParams.get("token");
const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage(); await p.goto(link, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2000);
const inputs = await p.$$("input[type=password]"); rec("Reset page shows password fields", inputs.length >= 1, inputs.length + " fields");
for (const i of inputs) await i.fill("NewPass@12345"); await p.getByRole("button", { name: /reset|set|save|update/i }).first().click().catch(() => {}); await p.waitForTimeout(2500);
let l = await login("hr@easyconstruct.demo", "NewPass@12345"); rec("Can sign in with the new password", l.s === 200, l.s);
l = await login("hr@easyconstruct.demo", "Demo@12345"); rec("Old password no longer works", l.s === 401, l.s);
r = await J("/auth/reset-password", { token, password: "Another@12345" }); rec("Used link cannot be reused", r.status >= 400, r.status);
r = await J("/auth/reset-password", { token: "garbage", password: "Another@12345" }); rec("Garbage token rejected", r.status >= 400 && r.status < 500, r.status);
// put the demo password back via a second flow
await J("/auth/forgot-password", { email: "hr@easyconstruct.demo" }); await new Promise((s) => setTimeout(s, 1500));
const t2 = new URL(linkOf(box().at(-1))).searchParams.get("token"); r = await J("/auth/reset-password", { token: t2, password: "Demo@12345" }); rec("Demo password restored", r.status === 200, r.status);
// 3 Owner fail-safe recovery through the UI button
const o = await login("nhylcyrusgervasio@gmail.com", "Demo@12345"); 
const ctx = await b.newContext(); const op = await ctx.newPage(); await op.goto(`${WEB}/login`); await op.fill("#email", "nhylcyrusgervasio@gmail.com"); await op.fill("#password", "Demo@12345"); await op.click("button:has-text('Sign in')"); await op.waitForTimeout(3000);
await op.goto(`${WEB}/owner/account-recovery`); await op.waitForTimeout(2000); const n0 = box().length;
await op.getByRole("button", { name: /Send recovery email/ }).first().click(); await op.waitForTimeout(800);
const dlg = await op.$("[role=alertdialog]:visible, [role=dialog]:visible"); if (dlg) { const bs = await dlg.$$("button"); for (const x of bs.reverse()) { const t = await x.innerText(); if (/send|confirm|yes|recover/i.test(t)) { await x.click(); break; } } }
await op.waitForTimeout(2500); const om = box().at(-1);
rec("Owner recovery email sent to the Owner", box().length === n0 + 1 && om.to.includes("nhylcyrusgervasio@gmail.com"), JSON.stringify(om?.to));
rec("Recovery email names the IT Designer account", /itdesigner@easyconstruct\.demo/.test(dec(om?.data || "")));
console.log("toast:", (await op.$$eval("[data-sonner-toast], [role=status]", (e) => e.map((x) => x.innerText).join("|"))).slice(0, 150));
// 4 sign-out retest (confirm dialog)
await op.goto(`${WEB}/dashboard`).catch(() => {}); await op.waitForTimeout(1500);
const tok = await op.evaluate(() => { for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const v = s.getItem(s.key(i)); if (v && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) return v; } return null; });
await op.locator("[aria-label='Sign out'], button:has-text('Sign out')").first().click(); await op.waitForTimeout(600);
await op.getByRole("button", { name: "Sign out" }).last().click(); await op.waitForTimeout(2000);
rec("Sign out returns to /login", /\/login/.test(op.url()), op.url());
const after = await fetch(API + "/notifications", { headers: { Authorization: "Bearer " + tok } }); rec("Token is dead after sign-out (server-side logout)", after.status === 401, "old token -> " + after.status);
const back = await op.goto(`${WEB}/dashboard`).catch(() => {}); await op.waitForTimeout(1500); rec("Protected page redirects to login after sign-out", /\/login/.test(op.url()), op.url());
await b.close();
