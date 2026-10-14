// Full details of one calendar event with an "Open" button to its source.
// Shown in a popover on desktop, a bottom sheet on a phone, and inline in the day panel.
import { format } from "date-fns";
import { AlertTriangle, Clock } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { attentionLabel, eventHref, fromIso } from "../lib/calendar-logic";
import type { CalendarEvent } from "../types/calendar.types";
import { EVENT_STYLE, statusText } from "./event-style";

export function AttentionBadge({ event }: { event: CalendarEvent }) {
  const label = attentionLabel(event);
  if (!label) return null;
  const Icon = event.attention === "overdue" ? AlertTriangle : Clock;
  return (
    <Badge variant="outline" className="gap-1 border-warning-strong/40 text-warning-strong">
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </Badge>
  );
}

export function EventDetails({ event, role, onOpen, heading = true }: { event: CalendarEvent; role: string; onOpen?: () => void; heading?: boolean }) {
  const style = EVENT_STYLE[event.type];
  const Icon = style.icon;
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="gap-1">
            <Icon className="h-3 w-3" aria-hidden /> {style.label}
          </Badge>
          <AttentionBadge event={event} />
        </div>
        {heading ? <h3 className="break-words text-sm font-semibold leading-snug">{event.title}</h3> : <p className="break-words font-medium leading-snug">{event.title}</p>}
        {event.detail && <p className="break-words text-xs text-muted-foreground">{event.detail}</p>}
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Project</dt>
        <dd className="break-words">
          {event.projectName} <span className="text-muted-foreground">({event.projectCode})</span>
        </dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{format(fromIso(event.date), "EEEE, d MMMM yyyy")}</dd>
        {event.status && (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{statusText(event.status)}</dd>
          </>
        )}
        {event.involves.length > 0 && (
          <>
            <dt className="text-muted-foreground">Involves</dt>
            <dd className="break-words">
              {event.involves.join(", ")}
              {event.mine ? " (you)" : ""}
            </dd>
          </>
        )}
      </dl>
      <Button asChild size="sm" className="w-full sm:w-auto">
        <Link to={eventHref(event, role)} onClick={onOpen}>
          Open
        </Link>
      </Button>
    </div>
  );
}
