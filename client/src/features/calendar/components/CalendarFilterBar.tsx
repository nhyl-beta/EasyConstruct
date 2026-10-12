// Legend toggles with counts, Project filter, "Mine only", and the "N hidden" hint with Reset.
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, hasActiveFilters, type CalendarFilters } from "../lib/calendar-logic";
import type { CalendarEventType } from "../types/calendar.types";
import { EVENT_STYLE } from "./event-style";

const ALL = "__all__";

export function CalendarFilterBar({
  filters,
  counts,
  projects,
  hiddenCount,
  onChange,
  onReset,
}: {
  filters: CalendarFilters;
  /** Per-type counts for the visible period, before the type toggles. */
  counts: Record<CalendarEventType, number>;
  projects: { code: string; name: string }[];
  hiddenCount: number;
  onChange: (next: CalendarFilters) => void;
  onReset: () => void;
}) {
  const toggleType = (type: CalendarEventType) =>
    onChange({
      ...filters,
      hiddenTypes: filters.hiddenTypes.includes(type) ? filters.hiddenTypes.filter((t) => t !== type) : [...filters.hiddenTypes, type],
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Show or hide event types" className="flex flex-wrap items-center gap-1.5">
          {EVENT_TYPES.map((type) => {
            const on = !filters.hiddenTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(type)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on ? "border-border bg-card text-foreground" : "border-dashed border-border text-muted-foreground line-through",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", EVENT_STYLE[type].dot, !on && "opacity-40")} aria-hidden />
                {EVENT_STYLE[type].label}
                <span className="tabular-nums text-muted-foreground">{counts[type]}</span>
                <span className="sr-only">{on ? "shown" : "hidden"}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="calendar-project" className="text-xs text-muted-foreground">
            Project
          </Label>
          <Select value={filters.project || ALL} onValueChange={(v) => onChange({ ...filters, project: v === ALL ? "" : v })}>
            <SelectTrigger id="calendar-project" size="sm" className="w-48 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="calendar-mine" checked={filters.mineOnly} onCheckedChange={(v) => onChange({ ...filters, mineOnly: v })} />
          <Label htmlFor="calendar-mine" className="text-xs text-muted-foreground">
            Mine only
          </Label>
        </div>
      </div>

      {hasActiveFilters(filters) && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
          {hiddenCount} event{hiddenCount === 1 ? "" : "s"} hidden by filters
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onReset}>
            Reset filters
          </Button>
        </p>
      )}
    </div>
  );
}
