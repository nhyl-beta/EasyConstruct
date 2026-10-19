// Everything on one day, grouped by type, each with its Open button. A right-hand panel on
// desktop, a bottom sheet on a phone. Radix traps focus inside and returns it on close.
import { format } from "date-fns";
import { CalendarOff } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { groupByType, fromIso } from "../lib/calendar-logic";
import type { CalendarEvent } from "../types/calendar.types";
import { EventDetails } from "./EventDetails";
import { EVENT_STYLE } from "./event-style";

export function CalendarDayPanel({
  day,
  events,
  hiddenCount,
  role,
  mobile,
  onClose,
}: {
  /** YYYY-MM-DD, or null when closed. */
  day: string | null;
  /** Events of that day after filters. */
  events: CalendarEvent[];
  /** Events of that day that the current filters hide. */
  hiddenCount: number;
  role: string;
  mobile: boolean;
  onClose: () => void;
}) {
  const groups = groupByType(events);
  return (
    <Sheet open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} className={mobile ? "max-h-[85vh] overflow-y-auto rounded-t-xl p-4" : "w-full overflow-y-auto p-4 sm:max-w-md"}>
        <SheetHeader className="p-0 pr-8">
          <SheetTitle>{day ? format(fromIso(day), "EEEE, d MMMM yyyy") : "Day"}</SheetTitle>
          <SheetDescription>
            {events.length === 0 ? "Nothing on this day." : `${events.length} event${events.length === 1 ? "" : "s"}`}
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden by filters` : ""}
          </SheetDescription>
        </SheetHeader>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            <CalendarOff className="h-6 w-6" aria-hidden />
            <p>No events on this day.</p>
            {hiddenCount > 0 && <p className="text-xs">{hiddenCount} hidden by the current filters.</p>}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.type} aria-label={EVENT_STYLE[g.type].label} className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${EVENT_STYLE[g.type].dot}`} aria-hidden />
                  {EVENT_STYLE[g.type].label} ({g.events.length})
                </h4>
                <ul className="space-y-2">
                  {g.events.map((e) => (
                    <li key={e.id} className="rounded-lg border border-border/60 p-3">
                      <EventDetails event={e} role={role} onOpen={onClose} heading={false} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
