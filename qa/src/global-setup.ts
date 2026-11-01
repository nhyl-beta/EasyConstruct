// Runs once per Playwright run: guard, sign in as every role (rate-limited, so once), and write a storageState per role.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_DIR, loadSessions } from "./api.js";
import { assertQaEnvironment } from "./guard.js";
import { ROLES } from "./roles.js";

export const TOKEN_KEY = "easyconstruct_token";
export const USER_KEY = "easyconstruct_user";
export const statePath = (slug: string) => join(AUTH_DIR, `${slug}.json`);

export default async function globalSetup() {
  const cfg = assertQaEnvironment();
  mkdirSync(AUTH_DIR, { recursive: true });
  // Fingerprint: the QA Owner exists only in the QA seed, so a successful login proves the API serves the QA database.
  const sessions = await loadSessions(ROLES.map((r) => r.label), true);
  const origin = new URL(cfg.baseUrl).origin;
  for (const r of ROLES) {
    const s = sessions[r.label]!;
    const user = { id: s.userId, email: s.email, name: s.name, role: r.backend };
    writeFileSync(statePath(r.slug), JSON.stringify({
      cookies: [],
      origins: [{ origin, localStorage: [{ name: TOKEN_KEY, value: s.token }, { name: USER_KEY, value: JSON.stringify(user) }] }],
    }));
  }
}
