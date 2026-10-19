// The three views of the same events: Month grid, Week columns and Agenda list.
// Every day has one focusable "day button" (data-day-btn) so the arrow keys can move
// between days; Enter on it opens the day panel.
import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { iso } from "../lib/calendar-logic";
import type { CalendarEvent } from "../types/calendar.types";
import { CalendarEventButton } from "./CalendarEventButton";
import { EVENT_STYLE } from "./event-style";

export interface ViewProps {
  anchor: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  role: string;
  mobile: boolean;
  todayIso: string;
  onSelect: (e: CalendarEvent) => void;
  onOpenDay: (day: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOWN_PER_DAY = 3;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const plural = (n: number) => `${n} event${n === 1 ? "" : "s"}`;

function DayNumber({ day, count, tabbable, today, muted, onOpen }: { day: Date; count: number; tabbable: boolean; today: boolean; muted?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-day-btn={iso(day)}
      tabIndex={tabbable ? 0 : -1}
      onClick={onOpen}
      aria-label={`${format(day, "EEEE d MMMM")}${today ? ", today" : ""}, ${plural(count)}. Open day`}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-overline hover:ring-1 hover:ring-border focus-visible:outline-2 focus-visible:outline-ring",
        today ? "bg-primary font-semibold text-primary-foreground" : muted ? "text-muted-foreground/60" : "text-foreground",
      )}
    >
      {format(day, "d")}
    </button>
  );
}

export function MonthGrid({ anchor, eventsByDate, role, mobile, todayIso, onSelect, onOpenDay }: ViewProps) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) });
  const anchorIso = iso(anchor);

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-overline font-medium uppercase tracking-wider text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 py-2 text-center md:px-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = iso(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const inMonth = day.getMonth() === anchor.getMonth();
          const today = key === todayIso;
          const base = cn(
            "border-b border-r border-border/50 last:border-r-0",
            !inMonth && "bg-muted/20",
            inMonth && isWeekend(day) && "bg-muted/30",
            today && "bg-primary/5 ring-1 ring-inset ring-primary/40",
          );

          if (mobile) {
            // Phone: dots only; the whole cell is one tap target that opens the day panel.
            return (
              <button
                key={key}
                type="button"
                data-day-btn={key}
                tabIndex={key === anchorIso ? 0 : -1}
                onClick={() => onOpenDay(key)}
                aria-label={`${format(day, "EEEE d MMMM")}${today ? ", today" : ""}, ${plural(dayEvents.length)}. Open day`}
                className={cn(base, "flex min-h-14 flex-col items-center gap-1 p-1 focus-visible:outline-2 focus-visible:outline-ring")}
              >
                <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full text-overline", today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/60")}>
                  {format(day, "d")}
                </span>
                <span className="flex flex-wrap justify-center gap-0.5" aria-hidden>
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", EVENT_STYLE[e.type].dot, e.attention && "ring-1 ring-warning-strong")} />
                  ))}
                </span>
                {dayEvents.length > 4 && <span className="text-overline text-muted-foreground">{dayEvents.length}</span>}
              </button>
            );
          }

          return (
            <div
              key={key}
              onClick={(e) => e.target === e.currentTarget && onOpenDay(key)}
              className={cn(base, "min-h-28 cursor-pointer p-1.5")}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <DayNumber day={day} count={dayEvents.length} tabbable={key === anchorIso} today={today} muted={!inMonth} onOpen={() => onOpenDay(key)} />
                {dayEvents.length > SHOWN_PER_DAY && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-overline tabular-nums" aria-label={plural(dayEvents.length)}>
                    {dayEvents.length}
                  </Badge>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, SHOWN_PER_DAY).map((e) => (
                  <CalendarEventButton key={e.id} event={e} role={role} mobile={false} onSelect={onSelect} />
                ))}
                {dayEvents.length > SHOWN_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    className="px-1 text-overline text-primary-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    +{dayEvents.length - SHOWN_PER_DAY} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeekView({ anchor, eventsByDate, role, mobile, todayIso, onSelect, onOpenDay }: ViewProps) {
  const days = eachDayOfInterval({ start: startOfWeek(anchor), end: endOfWeek(anchor) });
  const anchorIso = iso(anchor);
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((day) => {
        const key = iso(day);
        const dayEvents = eventsByDate.get(key) ?? [];
        const today = key === todayIso;
        return (
          <section
            key={key}
            aria-label={format(day, "EEEE d MMMM")}
            className={cn("min-h-24 rounded-xl border border-border p-2", isWeekend(day) && "bg-muted/30", today && "bg-primary/5 ring-1 ring-primary/40")}
          >
            <div className="mb-2 flex items-center gap-2">
              <DayNumber day={day} count={dayEvents.length} tabbable={key === anchorIso} today={today} onOpen={() => onOpenDay(key)} />
              <span className="text-xs text-muted-foreground">{format(day, "EEE")}</span>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-overline text-muted-foreground">Nothing scheduled</p>
            ) : (
              <div className="space-y-1">
                {dayEvents.map((e) => (
                  <CalendarEventButton key={e.id} event={e} role={role} mobile={mobile} onSelect={onSelect} wrap />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AgendaView({ anchor, eventsByDate, role, mobile, todayIso, onSelect, onOpenDay }: ViewProps) {
  const first = iso(startOfMonth(anchor));
  const last = iso(endOfMonth(anchor));
  const dates = [...eventsByDate.keys()].filter((d) => d >= first && d <= last).sort();
  const anchorIso = iso(anchor);
  const tabbableDay = dates.find((d) => d >= anchorIso) ?? dates[dates.length - 1];

  if (dates.length === 0) {
    return <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No events in {format(anchor, "MMMM yyyy")}.</p>;
  }
  return (
    <ol className="divide-y divide-border/60 rounded-xl border border-border">
      {dates.map((d) => {
        const day = new Date(`${d}T00:00:00`);
        const dayEvents = eventsByDate.get(d) ?? [];
        const today = d === todayIso;
        return (
          <li key={d} className={cn("flex gap-3 p-3", today && "bg-primary/5")}>
            <div className="w-14 shrink-0 text-center">
              <DayNumber day={day} count={dayEvents.length} tabbable={d === tabbableDay} today={today} onOpen={() => onOpenDay(d)} />
              <div className="text-overline uppercase text-muted-foreground">{format(day, "EEE")}</div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <CalendarEventButton event={e} role={role} mobile={mobile} onSelect={onSelect} wrap />
                  <div className="pl-3.5 text-overline text-muted-foreground">
                    {EVENT_STYLE[e.type].label} · {e.projectName}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
