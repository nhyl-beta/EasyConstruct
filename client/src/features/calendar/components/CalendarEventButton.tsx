// One event as a real button. Hover shows the full title; click opens the details in a
// popover (desktop). On a phone the parent opens a bottom sheet instead (onSelect).
import { useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { attentionLabel } from "../lib/calendar-logic";
import type { CalendarEvent } from "../types/calendar.types";
import { EventDetails } from "./EventDetails";
import { EVENT_STYLE } from "./event-style";

/** Screen-reader name: type, title, project, date and any attention text. */
export const eventAccessibleName = (e: CalendarEvent) =>
  [EVENT_STYLE[e.type].label, e.title, e.projectName, e.date, attentionLabel(e)].filter(Boolean).join(", ");

export function CalendarEventButton({
  event,
  role,
  mobile,
  onSelect,
  wrap = false,
}: {
  event: CalendarEvent;
  role: string;
  mobile: boolean;
  onSelect: (e: CalendarEvent) => void;
  /** Let the title wrap (week and agenda views) instead of truncating. */
  wrap?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = EVENT_STYLE[event.type];
  const AttentionIcon = event.attention === "overdue" ? AlertTriangle : event.attention === "waiting" ? Clock : null;

  const button = (
    <button
      type="button"
      aria-label={eventAccessibleName(event)}
      onClick={mobile ? () => onSelect(event) : undefined}
      className={cn(
        "flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-overline leading-tight hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        event.attention && "bg-warning-soft/60",
      )}
    >
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      <span className={wrap ? "min-w-0 break-words" : "min-w-0 truncate"}>{event.title}</span>
      {AttentionIcon && <AttentionIcon className="ml-auto mt-0.5 h-3 w-3 shrink-0 text-warning-strong" aria-hidden />}
    </button>
  );

  if (mobile) return button;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {event.title}
          {attentionLabel(event) ? ` (${attentionLabel(event)})` : ""}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="start">
        <EventDetails event={event} role={role} onOpen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
