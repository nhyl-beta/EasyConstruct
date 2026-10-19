import { Download, History } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes } from "@/features/uploads/lib/upload-file";
import { downloadRevision } from "../lib/revision-file";
import type { Revision } from "../types/revision.types";
import { ItemTypeBadge, RevisionStatusBadge } from "./RevisionBadges";
import { formatDateTime, versionText } from "../lib/revision-format";

function RevisionCard({ r, onOpen }: { r: Revision; onOpen: (r: Revision) => void }) {
  return (
    <li className="space-y-2 p-4">
      <button
        type="button"
        onClick={() => onOpen(r)}
        className="block w-full space-y-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open version history of ${r.itemTitle}, ${versionText(r)}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{r.itemTitle}</span>
          <ItemTypeBadge type={r.itemType} />
          <RevisionStatusBadge status={r.status} />
        </div>
        <p className="text-xs text-muted-foreground">{r.changeSummary}</p>
        <p className="text-overline text-muted-foreground">
          {r.projectCode} · {versionText(r)}
          {r.isCurrent ? " (current)" : ""} · {r.createdBy} · {formatDateTime(r.createdAt)}
        </p>
        <p className="text-overline text-muted-foreground">
          {r.fileName} · {formatBytes(r.fileSize)}
        </p>
      </button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => downloadRevision(r).catch((e: Error) => toast.error(e.message))}
      >
        <Download className="h-3 w-3" /> Download
      </Button>
    </li>
  );
}

/** Table from md up; stacked cards on phones, where eight columns would not fit. */
export function RevisionsTable({ rows, onOpen }: { rows: Revision[]; onOpen: (r: Revision) => void }) {
  return (
    <>
      <ul className="divide-y md:hidden" aria-label="Revisions">
        {rows.map((r) => (
          <RevisionCard key={r.id} r={r} onOpen={onOpen} />
        ))}
      </ul>
      <div className="hidden md:block">
        <RevisionsGrid rows={rows} onOpen={onOpen} />
      </div>
    </>
  );
}

function RevisionsGrid({ rows, onOpen }: { rows: Revision[]; onOpen: (r: Revision) => void }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[22%]">Item</TableHead>
          <TableHead className="w-[10%]">Project</TableHead>
          <TableHead className="w-[12%]">Version</TableHead>
          <TableHead className="w-[11%]">Status</TableHead>
          <TableHead className="w-[12%]">Author</TableHead>
          <TableHead className="w-[12%]">Date</TableHead>
          <TableHead className="w-[14%]">File</TableHead>
          <TableHead className="w-[7%] text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.id}
            tabIndex={0}
            className="cursor-pointer align-top hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            aria-label={`Open version history of ${r.itemTitle}, ${versionText(r)}`}
            onClick={() => onOpen(r)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r);
              }
            }}
          >
            <TableCell className="whitespace-normal break-words">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium">{r.itemTitle}</span>
                <ItemTypeBadge type={r.itemType} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={r.changeSummary}>
                {r.changeSummary}
              </p>
            </TableCell>
            <TableCell className="whitespace-normal break-words font-mono text-xs">
                <Link
                  to={`/projects/${encodeURIComponent(r.projectCode)}`}
                  className="text-primary-strong hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open project ${r.projectCode}`}
                >
                  {r.projectCode}
                </Link>
              </TableCell>
            <TableCell className="whitespace-normal text-sm">
              {versionText(r)}
              {r.isCurrent && (
                <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[9px]">
                  Current
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <RevisionStatusBadge status={r.status} />
            </TableCell>
            <TableCell className="whitespace-normal break-words text-xs">{r.createdBy}</TableCell>
            <TableCell className="whitespace-normal text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
            <TableCell className="whitespace-normal break-words text-xs">
              {r.fileName}
              <div className="text-muted-foreground">{formatBytes(r.fileSize)}</div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Version history" aria-label="Version history" onClick={() => onOpen(r)}>
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Download this version"
                  aria-label="Download this version"
                  onClick={() => downloadRevision(r).catch((e: Error) => toast.error(e.message))}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
