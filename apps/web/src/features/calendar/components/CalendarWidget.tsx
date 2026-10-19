// apps/web/src/features/calendar/components/CalendarWidget.tsx
//
// The calendar, embedded at the bottom of every role's dashboard (pages/dashboard/index.tsx).
// Month, Week and Agenda views over the events the server already scopes to the signed-in
// user (apps/api/src/calendar). Events are fetched for the visible month only and cached per
// range. The cursor date, view, filters and open day live in the URL (c* query keys) so a
// link can be shared and Back works; the last view and project are also remembered in
// localStorage.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRoleConfig } from "@/hooks/use-role-config";
import { CalendarDayPanel } from "./CalendarDayPanel";
import { CalendarFilterBar } from "./CalendarFilterBar";
import { CalendarMonthPicker } from "./CalendarMonthPicker";
import { AgendaView, MonthGrid, WeekView, type ViewProps } from "./CalendarViews";
import { EventDetails } from "./EventDetails";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import {
  NO_FILTERS,
  applyFilters,
  applyScopeFilters,
  countByType,
  fetchRange,
  fromIso,
  groupByDate,
  hasActiveFilters,
  inPeriod,
  iso,
  moveDay,
  parseState,
  periodRange,
  projectOptions,
  shiftAnchor,
  writeState,
  type ArrowKey,
  type CalendarState,
} from "../lib/calendar-logic";
import type { CalendarEvent, CalendarView } from "../types/calendar.types";

const VIEW_KEY = "calendar:view";
const PROJECT_KEY = "calendar:project";

// localStorage can be missing or throw (private window, blocked site data): the page must work without it.
const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* remembering the choice is a convenience only */
  }
};

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
];

const ARROWS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

function periodLabel(view: CalendarView, anchor: Date): string {
  if (view !== "week") return format(anchor, "MMMM yyyy");
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  return start.getMonth() === end.getMonth() ? `${format(start, "d")} – ${format(end, "d MMM yyyy")}` : `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}

function GridSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading calendar">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg md:h-24" />
        ))}
      </div>
    </div>
  );
}

export function CalendarWidget() {
  const { identity } = useRoleConfig();
  const role = identity.role;
  const isMobile = !!useIsMobile();
  const [params, setParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const todayIso = iso(new Date());
  const defaults = useMemo(() => {
    const stored = readStored(VIEW_KEY);
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    const view: CalendarView = stored === "month" || stored === "week" || stored === "agenda" ? stored : narrow ? "agenda" : "month";
    return { view, project: readStored(PROJECT_KEY) ?? "", today: todayIso };
  }, [todayIso]);
  const state = useMemo(() => parseState(params, defaults), [params, defaults]);
  const anchor = useMemo(() => fromIso(state.anchor), [state.anchor]);

  const update = useCallback(
    (patch: Partial<CalendarState>, replace = false) => {
      const next = { ...state, ...patch };
      setParams(writeState(params, next, { today: todayIso, project: defaults.project }), { replace });
      if (patch.view) writeStored(VIEW_KEY, patch.view);
      if (patch.filters) writeStored(PROJECT_KEY, patch.filters.project);
    },
    [state, params, setParams, todayIso, defaults.project],
  );

  const { events, loading, refreshing, error, retry } = useCalendarEvents(fetchRange(anchor));

  const { periodEvents, counts, hiddenCount, eventsByDate, projects } = useMemo(() => {
    const periodEvents = inPeriod(events, periodRange(state.view, anchor));
    const visible = applyFilters(periodEvents, state.filters);
    return {
      periodEvents,
      counts: countByType(applyScopeFilters(periodEvents, state.filters)),
      hiddenCount: periodEvents.length - visible.length,
      eventsByDate: groupByDate(applyFilters(events, state.filters)),
      projects: projectOptions(events, state.filters.project),
    };
  }, [events, state.view, state.filters, anchor]);

  // After an arrow key moves the cursor, put focus on the new day's button.
  useEffect(() => {
    if (!focusAfterMove.current) return;
    focusAfterMove.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-day-btn="${state.anchor}"]`)?.focus();
  }, [state.anchor, events]);

  const goTo = (d: Date) => update({ anchor: iso(d) });
  const shift = (direction: 1 | -1) => goTo(shiftAnchor(state.view, anchor, direction));

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Ignore keys typed in a field or menu, and keys from the panels (their DOM sits outside this widget).
    if (e.metaKey || e.ctrlKey || e.altKey || !e.currentTarget.contains(target)) return;
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"]')) return;
    if (e.key === "t" || e.key === "T") goTo(new Date());
    else if (e.key === "[") shift(-1);
    else if (e.key === "]") shift(1);
    else if (ARROWS.has(e.key) && state.view !== "agenda" && target.hasAttribute("data-day-btn")) {
      e.preventDefault();
      focusAfterMove.current = true;
      update({ anchor: iso(moveDay(anchor, e.key as ArrowKey)) }, true);
    }
  };

  const viewProps: ViewProps = {
    anchor,
    eventsByDate,
    role,
    mobile: isMobile,
    todayIso,
    onSelect: setSelected,
    onOpenDay: (day) => update({ day }),
  };

  const openDayEvents = state.day ? (eventsByDate.get(state.day) ?? []) : [];
  const openDayAll = state.day ? events.filter((e) => e.date === state.day).length : 0;

  return (
    <SectionCard title="Calendar" subtitle="Milestones, workflow submissions, progress updates and your own task due dates for the projects you're on.">
      <div ref={rootRef} onKeyDown={onKeyDown} className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label={state.view === "week" ? "Previous week" : "Previous month"} onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CalendarMonthPicker
              anchor={anchor}
              label={periodLabel(state.view, anchor)}
              onPick={(year, month) => {
                const last = new Date(year, month + 1, 0).getDate();
                goTo(new Date(year, month, Math.min(anchor.getDate(), last)));
              }}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label={state.view === "week" ? "Next week" : "Next month"} onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => goTo(new Date())}>
              Today
            </Button>
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating" />}
          </div>
          <SegmentedControl aria-label="Calendar view" options={VIEW_OPTIONS} value={state.view} onValueChange={(view) => update({ view })} />
        </div>

        <CalendarFilterBar
          filters={state.filters}
          counts={counts}
          projects={projects}
          hiddenCount={hiddenCount}
          onChange={(filters) => update({ filters }, true)}
          onReset={() => update({ filters: NO_FILTERS }, true)}
        />

        {error && events.length === 0 ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
            <p className="text-sm text-destructive-strong">We couldn't load the calendar. Check your connection and try again.</p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : loading ? (
          <GridSkeleton />
        ) : (
          <div aria-busy={refreshing} className={refreshing ? "opacity-70 transition-opacity" : "transition-opacity"}>
            {error && (
              <p role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs text-destructive-strong">
                The calendar may be out of date.
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={retry}>
                  Retry
                </Button>
              </p>
            )}
            {state.view !== "agenda" && periodEvents.length === 0 && !hasActiveFilters(state.filters) && (
              <p className="mb-2 text-xs text-muted-foreground">No events in this {state.view === "week" ? "week" : "month"}.</p>
            )}
            {state.view === "month" && <MonthGrid {...viewProps} />}
            {state.view === "week" && <WeekView {...viewProps} />}
            {state.view === "agenda" && <AgendaView {...viewProps} />}
            <p className="mt-2 hidden text-overline text-muted-foreground md:block">
              Keys: arrows move between days, Enter opens a day, T today, [ and ] change the period, Esc closes a panel.
            </p>
          </div>
        )}
      </div>

      <CalendarDayPanel
        day={state.day}
        events={openDayEvents}
        hiddenCount={openDayAll - openDayEvents.length}
        role={role}
        mobile={isMobile}
        onClose={() => update({ day: null }, true)}
      />
      {/* Phone: event details open in a bottom sheet (desktop uses a popover on the event). */}
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl p-4">
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">Event details</SheetTitle>
            <SheetDescription className="sr-only">Details of the selected calendar event</SheetDescription>
          </SheetHeader>
          {selected && <EventDetails event={selected} role={role} onOpen={() => setSelected(null)} />}
        </SheetContent>
      </Sheet>
    </SectionCard>
  );
}

CalendarWidget.displayName = "CalendarWidget";
