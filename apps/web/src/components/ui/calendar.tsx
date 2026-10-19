"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import {
  DayPicker,
  useNavigation,
  type CaptionProps,
} from "react-day-picker";
import { Button, buttonVariants } from "./button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Years offered in the caption dropdown, relative to the current year. */
const YEAR_RANGE_BACK = 80;
const YEAR_RANGE_FORWARD = 15;

/**
 * Month and year as selects, with the arrows either side.
 *
 * The stock caption is a static "September 2026" label with the two arrows
 * absolutely positioned on top of the same row. Reaching a project due date
 * in 2030 meant fifty clicks on the next-month arrow, and an employee's hire
 * date going backwards was worse. The app already has a Select; using it here
 * makes the calendar navigable in two clicks and makes it look like the rest
 * of the UI rather than like a third-party widget.
 */
function CalendarCaption({ displayMonth }: CaptionProps) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();

  const currentYear = new Date().getFullYear();
  const years = React.useMemo(() => {
    const first = currentYear - YEAR_RANGE_BACK;
    const count = YEAR_RANGE_BACK + YEAR_RANGE_FORWARD + 1;
    return Array.from({ length: count }, (_, i) => first + i);
  }, [currentYear]);

  const setMonth = (monthIndex: number) => {
    goToMonth(new Date(displayMonth.getFullYear(), monthIndex, 1));
  };

  const setYear = (year: number) => {
    goToMonth(new Date(year, displayMonth.getMonth(), 1));
  };

  return (
    <div className="flex items-center gap-1.5 px-1 pb-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        className="size-8 shrink-0 rounded-lg"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Select
        value={String(displayMonth.getMonth())}
        onValueChange={(v) => setMonth(Number(v))}
      >
        <SelectTrigger
          aria-label="Month"
          className="h-8 flex-1 rounded-lg border-0 bg-transparent px-2 text-sm font-medium shadow-none hover:bg-accent focus-visible:ring-1"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {MONTHS.map((month, index) => (
            <SelectItem key={month} value={String(index)}>
              {month}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(displayMonth.getFullYear())}
        onValueChange={(v) => setYear(Number(v))}
      >
        <SelectTrigger
          aria-label="Year"
          className="h-8 w-[4.75rem] shrink-0 rounded-lg border-0 bg-transparent px-2 text-sm font-medium tabular-nums shadow-none hover:bg-accent focus-visible:ring-1"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Next month"
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        className="size-8 shrink-0 rounded-lg"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-2",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "w-9 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground",
        row: "mt-1 flex w-full",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          props.mode === "range"
            ? "[&:has([aria-selected])]:bg-accent [&:has(>.day-range-end)]:rounded-r-lg [&:has(>.day-range-start)]:rounded-l-lg first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg"
            : "[&:has([aria-selected])]:rounded-lg",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 rounded-lg p-0 font-normal tabular-nums aria-selected:opacity-100",
        ),
        day_range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_selected:
          "bg-primary font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        // A ring rather than a filled background, so "today" stays readable
        // when it is also the selected day.
        day_today:
          "font-semibold text-foreground ring-1 ring-inset ring-primary/50",
        day_outside: "day-outside text-muted-foreground/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground/40 line-through",
        day_range_middle:
          "rounded-none aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{ Caption: CalendarCaption }}
      {...props}
    />
  );
}

export { Calendar };
