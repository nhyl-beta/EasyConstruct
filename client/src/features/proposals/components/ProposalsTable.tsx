import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { selectedRowClass } from "@/components/detail-panel/DetailPanel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Proposal } from "../types/proposal.types";

type SortKey = "proposalId" | "projectCode" | "submittedBy" | "status";
type SortDirection = "asc" | "desc";

interface ProposalsTableProps {
  proposals: Proposal[];
  /** Highlights the row and makes it clickable, for review screens. */
  selectedId?: number | null;
  onSelect?: (proposal: Proposal) => void;
  /** Reports the on-screen row order, so arrow keys can step through it. */
  onOrderChange?: (ids: number[]) => void;
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  width: string;
}> = [
  { key: "proposalId", label: "Proposal", width: "w-[22%]" },
  { key: "projectCode", label: "Project", width: "w-[12%]" },
  { key: "submittedBy", label: "Submitted by", width: "w-[14%]" },
  { key: "status", label: "Status", width: "w-[12%]" },
];

// Shared read view of the proposals register, used by Owner's executive table
// and IT Designer's oversight table.
//
// Ordering is explicit and visible. The rows arrive sorted by submission
// order, but nothing in the table said so, nothing showed which column that
// order belonged to, and the sequence the reader actually judges it by is the
// Proposal ID in the first column — which is not the same order, because
// proposal ids are minted from a timestamp and hand-entered ones don't follow
// the pattern at all. The table now sorts ascending on Proposal ID by
// default, marks the sorted column with an arrow, and lets the reader re-sort
// on any other column.
//
// Long free-text columns (title, review comment) wrap rather than truncate:
// a proposal title clipped to one line is unreadable precisely where a
// reviewer needs to tell two similar submissions apart. `break-words` covers
// the unbroken-string case (pasted refs, long codes) that `whitespace-normal`
// alone would let overflow the cell.
export function ProposalsTable({
  proposals,
  selectedId,
  onSelect,
  onOrderChange,
}: ProposalsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("proposalId");
  const [direction, setDirection] = useState<SortDirection>("asc");

  const sorted = useMemo(() => {
    const factor = direction === "asc" ? 1 : -1;
    return [...proposals].sort((a, b) => {
      const left = (a[sortKey] ?? "").toString();
      const right = (b[sortKey] ?? "").toString();
      // Numeric-aware so "PROP-9" sorts before "PROP-10".
      const compared = left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return compared !== 0 ? compared * factor : (a.id - b.id) * factor;
    });
  }, [proposals, sortKey, direction]);

  useEffect(() => {
    onOrderChange?.(sorted.map((p) => p.id));
  }, [sorted, onOrderChange]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className={column.width}>
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  aria-label={`Sort by ${column.label}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {column.label}
                  <SortIcon
                    active={sortKey === column.key}
                    direction={direction}
                  />
                </button>
              </TableHead>
            ))}
            <TableHead className="w-[12%]">Amount</TableHead>
            <TableHead className="w-[14%]">Reviewer</TableHead>
            <TableHead className="w-[14%]">Comment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
            <TableRow
              key={p.id}
              aria-selected={selectedId === p.id}
              onClick={onSelect ? () => onSelect(p) : undefined}
              className={[
                onSelect ? "cursor-pointer" : "",
                selectedId === p.id ? selectedRowClass : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <TableCell className="align-top">
                <div className="whitespace-normal break-words text-sm font-medium">
                  {p.title}
                </div>
                <div className="font-mono text-overline text-muted-foreground">
                  {p.proposalId}
                </div>
              </TableCell>
              <TableCell className="align-top font-mono text-xs text-muted-foreground">
                {p.projectCode}
              </TableCell>
              <TableCell className="align-top whitespace-normal break-words text-xs">
                {p.submittedBy}
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="align-top text-xs tabular-nums">
                {p.amount ?? "—"}
              </TableCell>
              <TableCell className="align-top whitespace-normal break-words text-xs text-muted-foreground">
                {p.reviewerName ?? "—"}
              </TableCell>
              <TableCell className="align-top whitespace-normal break-words text-xs text-muted-foreground">
                {p.reviewComment ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowDown className="h-3 w-3" />
  );
}

ProposalsTable.displayName = "ProposalsTable";
