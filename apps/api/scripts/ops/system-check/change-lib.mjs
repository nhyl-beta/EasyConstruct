// Helpers for the client-demo-change checks (change-NN-*.mjs). API only, no browser.
// Local throwaway database + API on :8123 only; refuses anything else.
import { API } from "./lib.mjs";

if (!/^http:\/\/localhost:8123\//.test(API)) {
  console.error(`REFUSED: SMOKE_BASE_URL must be the local check API (http://localhost:8123/api), got ${API}`);
  process.exit(2);
}

export { API };
export const ACCOUNTS = {
  admin: "admin@easyconstruct.demo",
  pm: "pm@easyconstruct.demo",
  hr: "hr@easyconstruct.demo",
  finance: "finance@easyconstruct.demo",
  architect: "architect@easyconstruct.demo",
  engineer: "engineer@easyconstruct.demo",
  site: "site@easyconstruct.demo",
  consultant: "consultant@easyconstruct.demo",
  itdesigner: "itdesigner@easyconstruct.demo",
  owner: "owner@easyconstruct.demo",
};

const tokens = new Map();

/** One sign-in per account per run (the sign-in limiter is 40 per 15 minutes). */
export async function login(who) {
  if (tokens.has(who)) return tokens.get(who);
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ACCOUNTS[who] ?? who, password: "Demo@12345" }),
  });
  if (!res.ok) {
    console.error(`Cannot sign in as ${who} (${res.status}). Restart the API to clear the limiter.`);
    process.exit(2);
  }
  const body = await res.json();
  tokens.set(who, body.data.token);
  return body.data.token;
}

/** Calls the API as `who` (or unauthenticated when who is null). Returns { status, body }. */
export async function call(who, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (who) headers.Authorization = `Bearer ${await login(who)}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, data: parsed && typeof parsed === "object" ? parsed.data : undefined };
}

let failures = 0;
export const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(ok ? "PASS" : "FAIL", name, detail ? `| ${detail}` : "");
};
export const finish = () => {
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
};
