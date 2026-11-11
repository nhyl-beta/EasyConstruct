import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboGroup {
  label: string;
  options: { value: string; label: string }[];
}

/** A filter dropdown you can type into, with options under group headings. `value` null = "all". */
export function GroupedCombobox({
  value,
  onChange,
  groups,
  allLabel,
  ariaLabel,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  groups: ComboGroup[];
  allLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn("h-9 w-full justify-between rounded-lg px-3 text-xs font-normal", className)}
        >
          <span className="truncate capitalize">{current?.label ?? allLabel}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-3.5 w-3.5", value === null ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
            </CommandGroup>
            {groups.map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${g.label} ${o.label}`}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                    <span className="capitalize">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
