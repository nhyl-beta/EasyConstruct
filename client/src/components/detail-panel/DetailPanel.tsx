import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export interface DetailPanelTab {
  value: string;
  label: string;
  content: ReactNode;
}

export interface DetailPanelProps {
  title: ReactNode;
  /** Small line under the title, e.g. a code and project number. */
  subtitle?: ReactNode;
  /** Status pill, shown beside the title. */
  badge?: ReactNode;
  tabs: DetailPanelTab[];
  /** Sticky footer, next to Close. Render nothing for read-only viewers. */
  footer?: ReactNode;
  onClose: () => void;
  /** Hides the header X (the Sheet draws its own). */
  hideCloseButton?: boolean;
  className?: string;
}

/**
 * The right-hand detail panel: header (title, subtitle, status, close), tabs
 * that scroll on their own, and a sticky footer for actions. Shared by the
 * proposal pages and the Roles & Permissions page.
 */
export function DetailPanel({ title, subtitle, badge, tabs, footer, onClose, hideCloseButton, className }: DetailPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      <header className={cn("flex items-start justify-between gap-3 border-b border-border p-4", hideCloseButton && "pr-12")}>
        <div className="min-w-0 space-y-1">
          <h2 className="whitespace-normal break-words text-base font-semibold leading-snug">{title}</h2>
          {subtitle && <p className="font-mono text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {!hideCloseButton && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue={tabs[0]?.value} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-4 mt-3 h-9 w-auto justify-start overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="space-y-4 p-4">
              {t.content}
            </TabsContent>
          ))}
        </div>
      </Tabs>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card p-3">
        {footer}
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </footer>
    </div>
  );
}

interface SplitDetailLayoutProps {
  /** The list (table, cards, tree). Always rendered. */
  children: ReactNode;
  /** Whether an item is selected. */
  open: boolean;
  onClose: () => void;
  /** Receives `inSheet` so the panel can hide its own X when the Sheet draws one. */
  panel: (opts: { inSheet: boolean }) => ReactNode;
  /** Names the sheet for assistive tech when the panel overlays the list. */
  sheetLabel?: string;
  /** Called with +1 / -1 on arrow down / up while the panel is open. */
  onStep?: (delta: 1 | -1) => void;
}

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
};

/**
 * List on the left (~60%), panel on the right (~40%, at least 420px) from 1024px up;
 * under that the panel slides over the list as a Sheet. Esc closes it; arrow
 * up/down steps the selection while it is open.
 */
export function SplitDetailLayout({ children, open, onClose, panel, sheetLabel = "Details", onStep }: SplitDetailLayoutProps) {
  const wide = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "Escape" && wide) onClose(); // the Sheet handles its own Esc
      else if (e.key === "ArrowDown" && onStep) {
        e.preventDefault();
        onStep(1);
      } else if (e.key === "ArrowUp" && onStep) {
        e.preventDefault();
        onStep(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose, onStep]);

  if (!wide) {
    return (
      <>
        {children}
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">{sheetLabel}</SheetTitle>
            <SheetDescription className="sr-only">{sheetLabel}</SheetDescription>
            {panel({ inSheet: true })}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className={cn("grid items-start gap-4", open ? "grid-cols-[minmax(0,3fr)_minmax(420px,2fr)]" : "grid-cols-1")}>
      <div className="min-w-0">{children}</div>
      {open && (
        <aside aria-label={sheetLabel} className="sticky top-4 h-[calc(100dvh-8rem)] overflow-hidden rounded-2xl border border-border shadow-sm">
          {panel({ inSheet: false })}
        </aside>
      )}
    </div>
  );
}

/** Row styling for the selected item in any list: tinted green with a green left accent bar. */
export const selectedRowClass = "bg-primary-soft/60 [&>td:first-child]:shadow-[inset_3px_0_0_0_var(--color-primary)]";
