import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { queryClient } from "@/lib/query-client";
import {
  EXPIRED_NOTICE_KEY,
  TOKEN_KEY,
  UNAUTHORIZED_EVENT,
  clearSession,
  getToken,
  readSession,
  saveSession,
  startHeartbeat,
  tokenExpiry,
  type SessionUser,
} from "./session";

export type AuthUser = SessionUser;

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser, remember: boolean, tabOnly?: boolean) => void;
  logout: () => void;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

  // Keeps an unchecked "Keep me signed in" session alive across tabs.
  useEffect(() => startHeartbeat(), []);

  // Cached query data belongs to whoever fetched it: when the signed-in person
  // changes (sign in, sign out, expiry, another tab), drop everything so the
  // next account can never be shown the previous account's rows.
  const previousUserId = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== id) queryClient.clear();
    previousUserId.current = id;
  }, [user?.id]);

  // Expired or revoked sessions must end in the login page, not in a screen
  // full of failing requests:
  //  - the API client fires UNAUTHORIZED_EVENT on any 401;
  //  - the token's own expiry is timed, so an idle tab signs out on schedule;
  //  - signing out (or in) in another tab is followed via the storage event.
  useEffect(() => {
    const expire = () => {
      clearSession();
      try {
        sessionStorage.setItem(EXPIRED_NOTICE_KEY, "1");
      } catch {
        /* storage unavailable — the redirect alone still happens */
      }
      setUser(null);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, expire);

    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY || event.key === null) setUser(readSession());
    };
    window.addEventListener("storage", onStorage);

    let timer: number | undefined;
    const token = getToken();
    const exp = token ? tokenExpiry(token) : null;
    if (user && exp !== null) {
      // setTimeout stores its delay in 32 bits (~24.8 days): a longer delay
      // overflows and fires at once, which signed users out the moment they
      // logged in with a 30-day token. Wait in capped slices and re-check.
      const MAX_DELAY = 2_147_000_000;
      const arm = () => {
        const left = exp - Date.now();
        if (left <= 0) expire();
        else timer = window.setTimeout(arm, Math.min(left, MAX_DELAY));
      };
      arm();
    }

    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, expire);
      window.removeEventListener("storage", onStorage);
      if (timer) window.clearTimeout(timer);
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      setSession: (token, nextUser, remember, tabOnly) => {
        saveSession(token, nextUser, remember, tabOnly);
        setUser(nextUser);
      },
      logout: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function getDashboardRoute(role: string) {
  return role === "project-manager" ? "/dashboard" : "/dashboard";
}
