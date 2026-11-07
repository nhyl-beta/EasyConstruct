import { DatePicker } from "@/components/ui/date-picker";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One row of single-choice chips, "All" first. Click the active chip again to clear it. */
export function FilterChips({
  label,
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  const chip = (v: string, text: string) => {
    const active = value === v;
    return (
      <button
        key={v}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(active ? "all" : v)}
        className={cn(
          "h-8 rounded-full border px-3 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-primary bg-primary/10 font-medium text-foreground"
            : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {text}
      </button>
    );
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {chip("all", allLabel)}
      {options.map((o) => chip(o, o))}
    </div>
  );
}

/** From / to date inputs (YYYY-MM-DD). Empty string means no bound. */
export function DateRangeFields({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-1.5">
        <span>From date</span>
        <DatePicker value={from} max={to || undefined} onChange={(v) => onChange(v, to)} className="h-8 w-40" />
      </label>
      <label className="flex items-center gap-1.5">
        <span>To date</span>
        <DatePicker value={to} min={from || undefined} onChange={(v) => onChange(from, v)} className="h-8 w-40" />
      </label>
    </div>
  );
}

/**
 * The shared list filter row: a search box, then whatever filters the page
 * passes in (chips, dropdowns, a date range), then Clear when any is active.
 */
export function FilterBar({
  query,
  onQuery,
  placeholder,
  active,
  onClear,
  children,
  className,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  active: boolean;
  onClear: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-8 pl-8 text-xs" />
      </div>
      {children}
      {active && (
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={onClear}>
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}
