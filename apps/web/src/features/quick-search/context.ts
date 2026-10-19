import { createContext, useContext, type RefObject } from "react";

export interface QuickSearchControls {
  open: boolean;
  query: string;
  /** True once the palette has been opened; record sources mount from then on. */
  everOpened: boolean;
  setQuery: (q: string) => void;
  /** Opens the palette, optionally with text carried over from the header box. */
  openPalette: (initialQuery?: string) => void;
  closePalette: () => void;
  /** The header's search box, so focus can return to it on close. */
  barRef: RefObject<HTMLInputElement | null>;
  /** Set right before focus is returned to the bar so that focus does not reopen the palette. */
  suppressFocusOpen: RefObject<boolean>;
}

export const QuickSearchContext = createContext<QuickSearchControls | null>(null);

export function useQuickSearchControls(): QuickSearchControls {
  const ctx = useContext(QuickSearchContext);
  if (!ctx) throw new Error("useQuickSearchControls must be used inside <QuickSearchProvider>");
  return ctx;
}
