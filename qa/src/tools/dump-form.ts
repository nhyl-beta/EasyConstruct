// Prints the fields and buttons of a form so UI flows can be written with label/role selectors.
//   tsx src/tools/dump-form.ts <role-slug> <route> [button text to click first]
import { chromium } from "@playwright/test";
import { statePath } from "../global-setup.js";
const [slug, route, click] = process.argv.slice(2) as [string, string, string?];
const SCRIPT = `(() => {
  var root = document.querySelector("[role=dialog]") || document.querySelector("main main") || document.body;
  var vis = function (e) { return !!(e.offsetParent || e.getClientRects().length); };
  var lab = function (e) { var id = e.id; var l = id ? document.querySelector('label[for="' + id + '"]') : null; return (l && l.textContent || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.getAttribute("name") || "").trim().slice(0, 40); };
  var f = [].slice.call(root.querySelectorAll("input,textarea,select,[role=combobox],[role=checkbox],[role=radio],[role=switch]")).filter(vis).map(function (e) { return e.tagName.toLowerCase() + (e.getAttribute("type") ? ":" + e.getAttribute("type") : "") + "[" + (e.getAttribute("role") || "") + "] label=" + JSON.stringify(lab(e)) + (e.disabled ? " DISABLED" : "") + (e.readOnly ? " READONLY" : ""); });
  var b = [].slice.call(root.querySelectorAll("button")).filter(vis).map(function (e) { return (e.textContent || e.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ").slice(0, 30) + (e.disabled ? " (disabled)" : ""); }).filter(Boolean);
  var h = [].slice.call(root.querySelectorAll("h1,h2,h3,legend")).filter(vis).map(function (e) { return e.textContent.trim().slice(0, 50); });
  return { url: location.pathname, headings: h.slice(0, 8), fields: f, buttons: b };
})()`;
const b = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ storageState: statePath(slug), baseURL: "http://localhost:5173" });
const p = await ctx.newPage(); await p.goto(route); await p.waitForTimeout(3000);
if (click) { await p.getByRole("button", { name: new RegExp("^" + click, "i") }).first().click().catch(async () => { await p.getByRole("link", { name: new RegExp("^" + click, "i") }).first().click(); }); await p.waitForTimeout(1500); }
console.log(JSON.stringify(await p.evaluate(SCRIPT), null, 1));
await b.close();
