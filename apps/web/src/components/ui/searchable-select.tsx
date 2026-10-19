// apps/web/src/components/ui/searchable-select.tsx
//
// The one searchable dropdown. Pickers that list people or records (project
// manager, engineer, architect, project, employee…) grow past what a plain
// <Select> can scan by eye, and they arrived in whatever order the API
// returned them. This gives every such picker type-to-search and a stable
// alphabetical order, in one place, so nothing is patched dropdown by
// dropdown. Short fixed enums (risk, currency, status) keep using <Select>.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary text shown muted beside the label and matched by the search. */
  description?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Marks the field invalid (red border) — set by the owning form. */
  invalid?: boolean;
  /** "alpha" (default) sorts by label, case- and accent-insensitively; "none" keeps the given order. */
  sort?: "alpha" | "none";
  id?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled = false,
  loading = false,
  invalid = false,
  sort = "alpha",
  id,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const ordered = useMemo(
    () =>
      sort === "alpha"
        ? [...options].sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }),
          )
        : options,
    [options, sort],
  );

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between rounded-xl px-3 font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive",
            className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : loading ? "Loading…" : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 rounded-xl p-0"
      >
        <Command
          // cmdk matches against `value`; label + description is what the
          // user sees, so that is what they should be able to type.
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{loading ? "Loading…" : emptyText}</CommandEmpty>
            <CommandGroup>
              {ordered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description ?? ""} ${option.value}`}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                  {option.description && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

SearchableSelect.displayName = "SearchableSelect";
