import { SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  /** Number of filters currently applied; shown on the phone "Filters" button. */
  activeCount?: number;
  /**
   * Controls that stay visible on phones next to the "Filters" button
   * (normally the search box). Everything else collapses below `md`.
   */
  primary?: React.ReactNode;
}

/**
 * Filter row that wraps instead of overflowing. From `md` up every control is
 * shown. Below `md` the secondary controls sit in a collapsible panel behind a
 * "Filters" button, so a page with five filters is not five stacked rows.
 */
export function FilterBar({ children, className, activeCount = 0, primary }: FilterBarProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  return (
    <div data-slot="filter-bar" className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        {primary && <div className="min-w-0 flex-1">{primary}</div>}
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 gap-1.5"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-overline tabular-nums text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </div>
      <div
        id={panelId}
        className={cn(
          "min-w-0 flex-wrap items-center gap-2 md:flex",
          open ? "flex" : "hidden",
        )}
      >
        {children}
        {primary && <div className="hidden min-w-0 md:block md:w-56">{primary}</div>}
      </div>
    </div>
  );
}

/** One control in a FilterBar: full width on phones, content width from `sm`. */
export function FilterField({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full min-w-0 sm:w-auto sm:min-w-40", className)}>{children}</div>
  );
}

/** Two date inputs side by side, even on a phone. */
export function FilterDates({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto", className)}>
      {children}
    </div>
  );
}
