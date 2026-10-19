import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useKBar, VisualState } from "@refinedev/kbar";

import { QuickSearchContext, type QuickSearchControls } from "./context";

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

/** Owns the palette's open state and the global shortcuts (/, Ctrl+K, Cmd+K). Mounted once, in the layout. */
export function QuickSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [everOpened, setEverOpened] = useState(false);
  const barRef = useRef<HTMLInputElement | null>(null);
  const suppressFocusOpen = useRef(false);

  // The app also mounts Refine's kbar (<RefineKbar /> in App.tsx), a resource
  // list on the same Ctrl/Cmd+K shortcut. This palette replaces it, so keep
  // kbar closed whenever it tries to open.
  const { kbarVisualState, query: kbarQuery } = useKBar((state) => ({ kbarVisualState: state.visualState }));
  useEffect(() => {
    if (kbarVisualState !== VisualState.hidden) kbarQuery.setVisualState(VisualState.hidden);
  }, [kbarVisualState, kbarQuery]);

  const openPalette = useCallback((initialQuery?: string) => {
    if (initialQuery !== undefined) setQuery(initialQuery);
    setEverOpened(true);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (open) closePalette();
        else openPalette("");
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        openPalette("");
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, openPalette, closePalette]);

  const value = useMemo<QuickSearchControls>(
    () => ({ open, query, everOpened, setQuery, openPalette, closePalette, barRef, suppressFocusOpen }),
    [open, query, everOpened, openPalette, closePalette],
  );

  return <QuickSearchContext.Provider value={value}>{children}</QuickSearchContext.Provider>;
}
