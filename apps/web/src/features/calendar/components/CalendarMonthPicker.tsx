// Click the month title to jump to any month of any year.
import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMM"));

export function CalendarMonthPicker({ anchor, label, onPick }: { anchor: Date; label: string; onPick: (year: number, month: number) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(anchor.getFullYear());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setYear(anchor.getFullYear());
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 gap-1 px-2 text-sm font-medium" aria-label={`${label}. Choose month and year`}>
          {label}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="center">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{year}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {MONTHS.map((m, i) => {
            const current = year === anchor.getFullYear() && i === anchor.getMonth();
            return (
              <Button
                key={m}
                variant={current ? "default" : "ghost"}
                size="sm"
                className="h-8 px-0 text-xs"
                aria-pressed={current}
                onClick={() => {
                  onPick(year, i);
                  setOpen(false);
                }}
              >
                {m}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
