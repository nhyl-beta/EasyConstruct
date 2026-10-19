// apps/web/src/components/shared/suggest-input.tsx
//
// A text field that offers real values without forbidding a new one.
//
// The previous approach was a bare `<input list="...">` backed by a
// `<datalist>`. It technically had suggestions, but a datalist gives the
// field no affordance at all: it renders as an ordinary textbox, and the
// browser only reveals the list once the user has already typed a matching
// prefix or happens to press the down arrow. Nobody discovers it, so people
// type free text — which is how a budget ended up owned by "TEST" and how
// "Structural Eng." and "Structural Engineering" became two departments.
//
// This shows a dropdown button, opens the full list on click, filters as you
// type, and still accepts a value that is not on the list.
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  id?: string;
  placeholder?: string;
  /** Heading above the list, e.g. "Departments". */
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

export function SuggestInput({
  value,
  onChange,
  suggestions,
  id,
  placeholder,
  emptyMessage = "No matches — the typed value will be used as-is.",
  loading = false,
  className,
}: SuggestInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={loading ? "Loading suggestions…" : placeholder}
        autoComplete="off"
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Show suggestions"
            disabled={loading}
            className="shrink-0"
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search…" className="h-9" />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion}
                    value={suggestion}
                    onSelect={() => {
                      onChange(suggestion);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === suggestion ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {suggestion}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

SuggestInput.displayName = "SuggestInput";
