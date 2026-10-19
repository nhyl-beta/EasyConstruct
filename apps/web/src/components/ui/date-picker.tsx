// apps/web/src/components/ui/date-picker.tsx
//
// Every date field in the app was `<Input type="date">` — the browser's own
// control. That is not a design decision, it is the absence of one: it
// renders differently in every browser and OS, ignores the app's theme
// entirely (a dark-mode page gets a white system panel), and on Chrome hides
// the picker behind a tiny icon at the far end of the field. The styled
// Calendar component existed but its only consumer was an unused data-table
// filter, so no screen ever showed it.
//
// This is the designed replacement: the app's own Calendar in a Popover,
// behind a trigger that reads like the Inputs beside it. It speaks the same
// ISO `yyyy-MM-dd` strings the native input did, so it is a drop-in.
import { useEffect, useState } from "react";
import { format, isValid, parse, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Display format in the trigger. ISO stays the wire format. */
const DISPLAY_FORMAT = "d MMM yyyy";

/** Formats accepted from manual typing, tried in order. All-numeric. */
const TYPED_FORMATS = ["yyyy-MM-dd", "M/d/yyyy", "MM/dd/yyyy"];

function parseTyped(text: string): Date | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  for (const fmt of TYPED_FORMATS) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return undefined;
}

/**
 * `parseISO` on a date-only string yields local midnight, so formatting it
 * back cannot drift across the date line the way `new Date("2026-01-12")`
 * (parsed as UTC) does.
 */
function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

interface DatePickerProps {
  /** ISO `yyyy-MM-dd`, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Hides the clear button where the field is required. */
  clearable?: boolean;
  /** Earliest selectable ISO date (inclusive). Earlier days are disabled. */
  min?: string;
  /** Latest selectable ISO date (inclusive). */
  max?: string;
  /** Marks the field invalid (red border) — set by the owning form. */
  invalid?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  disabled = false,
  clearable = true,
  min,
  max,
  invalid = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  // Free-typed text, kept separate from `selected` so an in-progress,
  // not-yet-valid keystroke (e.g. "2026-09-") doesn't get clobbered by a
  // reformat on every render.
  const [text, setText] = useState(selected ? format(selected, DISPLAY_FORMAT) : "");

  useEffect(() => {
    setText(selected ? format(selected, DISPLAY_FORMAT) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const minDate = toDate(min);
  const maxDate = toDate(max);
  const outOfRange = (date: Date) =>
    (!!minDate && format(date, "yyyy-MM-dd") < format(minDate, "yyyy-MM-dd")) ||
    (!!maxDate && format(date, "yyyy-MM-dd") > format(maxDate, "yyyy-MM-dd"));

  const commit = (date: Date | undefined) => {
    if (date && outOfRange(date)) return;
    onChange(date ? format(date, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  const commitTyped = () => {
    const parsed = parseTyped(text);
    if (parsed && outOfRange(parsed)) {
      // A typed date outside the allowed window is refused the same way the
      // calendar refuses to select it — snap back to the last valid value.
      setText(selected ? format(selected, DISPLAY_FORMAT) : "");
    } else if (parsed) {
      onChange(format(parsed, "yyyy-MM-dd"));
    } else if (!text.trim()) {
      onChange("");
    } else {
      // Invalid — snap the text back to the last valid value instead of
      // silently keeping unparseable input in the field.
      setText(selected ? format(selected, DISPLAY_FORMAT) : "");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-xl border border-input bg-transparent shadow-xs",
          "focus-within:ring-1 focus-within:ring-ring",
          invalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
            }
          }}
          className="h-full flex-1 rounded-xl rounded-r-none border-none shadow-none focus-visible:ring-0"
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-full w-9 shrink-0 rounded-l-none text-muted-foreground"
            title="Open calendar"
          >
            <CalendarIcon className="size-4" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="w-auto rounded-2xl p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          disabled={minDate || maxDate ? outOfRange : undefined}
          onSelect={commit}
          initialFocus
        />
        <div className="flex items-center justify-between border-t border-border/70 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-lg"
            disabled={outOfRange(new Date())}
            onClick={() => commit(new Date())}
          >
            Today
          </Button>
          {clearable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!selected}
              className="rounded-lg text-muted-foreground"
              onClick={() => commit(undefined)}
            >
              <X className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

DatePicker.displayName = "DatePicker";
