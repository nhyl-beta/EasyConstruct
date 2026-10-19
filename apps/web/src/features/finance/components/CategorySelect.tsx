import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useExpenseCategories } from "../hooks/use-expense-categories";
import { categoryKey } from "../lib/category-name";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * The one category dropdown. Lists the ACTIVE categories only, so retired ones
 * cannot be picked for something new. The current value is always shown: when it
 * was retired since (an old record being viewed or saved) it stays selectable,
 * marked "retired". If the list cannot be loaded it says so and offers a retry;
 * it never falls back to a built-in list.
 */
export function CategorySelect({ value, onValueChange, id, placeholder = "Select", className, disabled }: Props) {
  const { categories, activeCategories, loading, error, refresh } = useExpenseCategories();

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex min-h-9 items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm text-destructive-strong",
          className,
        )}
      >
        <span>Couldn't load categories.</span>
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const current = value ? categories.find((c) => categoryKey(c.name) === categoryKey(value)) : undefined;
  // A value that is not an active category (retired, or not in the list at all) stays visible.
  const extra = value && !activeCategories.some((c) => categoryKey(c.name) === categoryKey(value)) ? value : null;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={loading ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {activeCategories.map((c) => (
          <SelectItem key={c.id} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
        {extra !== null && (
          <SelectItem value={extra}>
            {current?.name ?? extra} <span className="text-muted-foreground">({current ? "retired" : "not in list"})</span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
