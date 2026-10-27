import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

interface SortableHeadProps {
  label: string;
  /** Whether this column is the one currently sorted. */
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  className?: string;
}

/**
 * A sortable column header: label and sort arrow on one line (never wrapped),
 * with the arrow the same size and vertically centred on the text in all three
 * states (unsorted, ascending, descending).
 */
export function SortableHead({ label, active, direction, onSort, className }: SortableHeadProps) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn("whitespace-nowrap", className)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-foreground"
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5 shrink-0", !active && "opacity-40")} />
      </button>
    </TableHead>
  );
}
