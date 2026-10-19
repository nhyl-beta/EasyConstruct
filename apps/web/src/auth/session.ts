// apps/web/src/auth/session.ts
//
// Where the signed-in session lives, and when it stops being valid.
//
// "Keep me signed in" checked   → the session survives closing the browser.
// "Keep me signed in" unchecked → the session lasts for the browser session:
//   it is shared by every tab of the same browser (a new tab must not ask for
//   a login again), and ends when the browser is closed.
//
// sessionStorage can't do the second: it is private to a single tab, so a new
// tab always started signed out. Both kinds of session therefore live in
// localStorage; the unchecked kind is flagged "session only" and kept alive by
// a heartbeat written by whichever tabs are open. A browser restart finds a
// stale heartbeat and discards the session.

export const TOKEN_KEY = "easyconstruct_token";
export const USER_KEY = "easyconstruct_user";
const SESSION_ONLY_KEY = "easyconstruct_session_only";
const HEARTBEAT_KEY = "easyconstruct_last_seen";
export const EXPIRED_NOTICE_KEY = "easyconstruct_session_expired";

/** A session-only login whose tabs have all been closed this long is gone. */
const HEARTBEAT_STALE_MS = 30_000;
const HEARTBEAT_EVERY_MS = 5_000;

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function getToken(): string | null {
  return safe(
    () => sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY),
    null,
  );
}

/** `exp` (ms since epoch) from the JWT payload, or null if unreadable. */
export function tokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * A tab-only session lives in this tab's sessionStorage and wins over the
 * shared localStorage session, so one Chrome profile can hold a different role
 * per tab. It ends when the tab is closed.
 */
export function isTabSession(): boolean {
  return safe(() => sessionStorage.getItem(TOKEN_KEY) !== null, false);
}

export function clearSession(): void {
  // Signing out of a tab-only session must not sign out the other tabs.
  if (isTabSession()) {
    safe(() => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }, undefined);
    return;
  }
  safe(() => {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    }
    localStorage.removeItem(SESSION_ONLY_KEY);
    localStorage.removeItem(HEARTBEAT_KEY);
  }, undefined);
}

export function saveSession(
  token: string,
  user: SessionUser,
  remember: boolean,
  tabOnly = false,
): void {
  if (tabOnly) {
    safe(() => {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.removeItem(EXPIRED_NOTICE_KEY);
    }, undefined);
    return;
  }
  clearSession();
  safe(() => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (!remember) {
      localStorage.setItem(SESSION_ONLY_KEY, "1");
      localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
    }
    sessionStorage.removeItem(EXPIRED_NOTICE_KEY);
  }, undefined);
}

/** The stored session if there is one and it is still valid; otherwise null. */
export function readSession(): SessionUser | null {
  return safe(() => {
    // This tab's own session (if any) wins over the shared one.
    const stores = [sessionStorage, localStorage];
    for (const store of stores) {
      const token = store.getItem(TOKEN_KEY);
      if (!token) continue;

      const exp = tokenExpiry(token);
      if (exp !== null && exp <= Date.now()) {
        clearSession();
        safe(() => sessionStorage.setItem(EXPIRED_NOTICE_KEY, "1"), undefined);
        return null;
      }

      if (store === localStorage && localStorage.getItem(SESSION_ONLY_KEY) === "1") {
        const last = Number(localStorage.getItem(HEARTBEAT_KEY) ?? 0);
        if (Date.now() - last > HEARTBEAT_STALE_MS) {
          clearSession();
          return null;
        }
      }

      const rawUser = store.getItem(USER_KEY);
      if (!rawUser) continue;
      try {
        return JSON.parse(rawUser) as SessionUser;
      } catch {
        clearSession();
        return null;
      }
    }
    return null;
  }, null);
}

/** Keeps a session-only login alive while this tab is open. Returns a stop fn. */
export function startHeartbeat(): () => void {
  const beat = () =>
    safe(() => {
      if (localStorage.getItem(SESSION_ONLY_KEY) === "1") {
        localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
      }
    }, undefined);
  beat();
  const timer = window.setInterval(beat, HEARTBEAT_EVERY_MS);
  window.addEventListener("beforeunload", beat);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("beforeunload", beat);
  };
}

/** Fired by the API client when the server rejects the token (401). */
export const UNAUTHORIZED_EVENT = "easyconstruct:unauthorized";
