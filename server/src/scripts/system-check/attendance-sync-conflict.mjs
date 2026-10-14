import { chromium } from "playwright"; import { execSync } from "node:child_process";
const PSQL = (q) => execSync(`PGHOST=/tmp PGPORT=5544 psql -U postgres easyconstruct_check -At -c "${q}"`).toString().trim();
const EMP = PSQL("select employee_id from employees where email='site@easyconstruct.demo'");
const cnt = () => PSQL(`select count(*) from attendance where employee_id='${EMP}' and log_date=current_date`);
PSQL(`delete from attendance where employee_id='${EMP}' and log_date=current_date`);
const S4 = { lat: 14.5764, lng: 121.0851 };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ["geolocation"] });
const page = await ctx.newPage(); const posts = [];
page.on("response", (r) => { if (r.request().method() === "POST" && r.url().includes("/api/")) posts.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
await page.goto("http://localhost:5173/login"); await page.fill("#email", "site@easyconstruct.demo"); await page.fill("#password", "Demo@12345"); await page.click("button:has-text('Sign in')"); await page.waitForTimeout(3000);
await page.goto("http://localhost:5173/attendance"); await page.waitForTimeout(2500);
await page.locator("[role=combobox]").first().click(); await page.getByRole("option", { name: /DEMO-S4/ }).click(); await page.waitForTimeout(500);
await ctx.setOffline(true); await ctx.setGeolocation({ latitude: S4.lat, longitude: S4.lng, accuracy: 8 });
await page.getByRole("button", { name: /Verify location/ }).click(); await page.waitForTimeout(500);
await page.setInputFiles("input[type=file]", { name: "o.png", mimeType: "image/png", buffer: PNG }); await page.waitForTimeout(300);
await page.getByRole("button", { name: "Confirm attendance" }).click(); await page.waitForTimeout(1000);
// scenario A: clean sync latency
var t0 = Date.now(); await ctx.setOffline(false);
let lat = null; for (let i = 0; i < 60; i++) { if (cnt() === "1") { lat = (Date.now() - t0) / 1000; break; } await page.waitForTimeout(500); }
console.log("RESULT sync latency after reconnect (s):", lat, posts.join(" ; "));
// scenario B: conflict final UI
PSQL(`delete from attendance where employee_id='${EMP}' and log_date=current_date`);
await page.reload(); await page.waitForTimeout(2500);
await page.locator("[role=combobox]").first().click(); await page.getByRole("option", { name: /DEMO-S4/ }).click(); await page.waitForTimeout(500);
await ctx.setOffline(true); await page.getByRole("button", { name: /Verify location/ }).click(); await page.waitForTimeout(500);
await page.setInputFiles("input[type=file]", { name: "o.png", mimeType: "image/png", buffer: PNG }); await page.waitForTimeout(300);
await page.getByRole("button", { name: "Confirm attendance" }).click(); await page.waitForTimeout(1000);
PSQL(`insert into attendance(employee_id,site,project_code,clock_in,geofence,photo,status,log_date) values('${EMP}','x','DEMO-S4','06:00','Inside','Verified','Verified',current_date)`);
posts.length = 0; t0 = Date.now(); await ctx.setOffline(false); await page.waitForTimeout(12000);
const txt = await page.locator("[data-slot='sidebar-inset']").first().innerText();
console.log("RESULT conflict ui:", JSON.stringify(txt.split("\n").filter((l) => /queued|sync|conflict|already|error|fail|Retry/i.test(l))), "posts:", posts.join(" ; "), "rows:", cnt());
await page.getByRole("button", { name: /Retry sync/ }).click().catch(() => {}); await page.waitForTimeout(3000);
const txt2 = await page.locator("[data-slot='sidebar-inset']").first().innerText();
console.log("RESULT after manual retry:", JSON.stringify(txt2.split("\n").filter((l) => /queued|sync|conflict|already|error|fail|Retry/i.test(l))));
// scenario C: double clock-in through UI online (page already shows clocked in -> form hidden?)
console.log("RESULT clocked-in view hides form:", await page.getByRole("button", { name: "Confirm attendance" }).count() === 0);
PSQL(`delete from attendance where employee_id='${EMP}' and log_date=current_date`); await b.close();
