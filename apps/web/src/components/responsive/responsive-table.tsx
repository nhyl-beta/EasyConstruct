import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Wraps a hand-written table so a wide one scrolls inside its own box instead
 * of widening the page, optionally pinning the first column.
 *
 *   <TableScroll stickyFirstColumn><Table>…</Table></TableScroll>
 *
 * The shadcn <Table> already has an overflow-x-auto box; this adds the
 * `min-w-0`/`max-w-full` that lets that box shrink inside a flex or grid parent
 * (without it the box takes the table's width and the page scrolls instead),
 * plus the sticky first column.
 */
export function TableScroll({
  children,
  className,
  stickyFirstColumn = false,
}: {
  children: React.ReactNode;
  className?: string;
  stickyFirstColumn?: boolean;
}) {
  return (
    <div
      data-slot="table-scroll"
      className={cn(
        "w-full max-w-full min-w-0 overflow-x-auto",
        stickyFirstColumn &&
          "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-card [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ResponsiveColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Right-align (numbers, amounts). */
  numeric?: boolean;
  /** Extra classes for the cell on `md+`. */
  className?: string;
  /** Hide this column in the phone card (e.g. a row-actions column rendered separately). */
  hideInCard?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Rendered as the card heading on phones. Defaults to the first column. */
  cardTitle?: (row: T) => React.ReactNode;
  /** Actions shown at the bottom of a phone card. */
  cardActions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
  /** Switch to cards below `md` when there are more than this many columns. Default 4. */
  cardThreshold?: number;
}

/**
 * Data table with two layouts:
 *  - `md` and up: a normal table, scrolling sideways inside its container with
 *    the first column pinned;
 *  - below `md`, when it has more than `cardThreshold` columns: one stacked
 *    card per row with "label: value" pairs, so nothing needs sideways scrolling.
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  cardTitle,
  cardActions,
  onRowClick,
  empty,
  className,
  cardThreshold = 4,
}: ResponsiveTableProps<T>) {
  const asCards = columns.length > cardThreshold;
  if (rows.length === 0 && empty) return <>{empty}</>;
  const [first, ...rest] = columns;
  return (
    <div data-slot="responsive-table" className={cn("min-w-0", className)}>
      <TableScroll stickyFirstColumn className={cn(asCards && "hidden md:block")}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.numeric && "text-right tabular-nums", c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>

      {asCards && (
        <ul className="space-y-2 md:hidden">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              className={cn(
                "min-w-0 rounded-xl border border-border bg-card p-3",
                onRowClick && "cursor-pointer active:bg-muted/50",
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              <div className="min-w-0 break-words font-medium">
                {cardTitle ? cardTitle(row) : first.cell(row)}
              </div>
              <dl className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-sm">
                {(cardTitle ? columns : rest)
                  .filter((c) => !c.hideInCard)
                  .map((c) => (
                    <React.Fragment key={c.key}>
                      <dt className="min-w-0 text-muted-foreground">{c.header}</dt>
                      <dd className="min-w-0 break-words">{c.cell(row)}</dd>
                    </React.Fragment>
                  ))}
              </dl>
              {cardActions && <div className="mt-3 flex flex-wrap gap-2">{cardActions(row)}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
