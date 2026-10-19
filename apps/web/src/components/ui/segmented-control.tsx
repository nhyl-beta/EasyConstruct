import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  /** One word; no icons or counts. */
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}

/** Two to four views of the same data; the pressed segment lifts onto a sunken track. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex gap-0.5 rounded-md bg-muted p-1", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "h-8 rounded-sm px-4 text-body font-medium text-muted-foreground transition-[color,background-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-md",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
