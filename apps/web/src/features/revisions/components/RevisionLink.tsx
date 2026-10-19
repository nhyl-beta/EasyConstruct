import { Link } from "react-router";
import { GitBranch } from "lucide-react";

import { RevisionStatusBadge } from "./RevisionBadges";
import { versionText } from "../lib/revision-format";
import type { Revision, RevisionItemType } from "../types/revision.types";

/**
 * "View revisions" action for an item on another page (designs, blueprints,
 * documentation), with the status of its current version when it has one.
 * Opens the Revisions page with that item's history drawer.
 */
export function RevisionLink({
  itemType,
  itemId,
  current,
  stopPropagation = false,
}: {
  itemType: RevisionItemType;
  itemId: number;
  /** The item's current revision, from useCurrentRevisions (undefined = none recorded). */
  current?: Revision;
  /** Set inside clickable rows so following the link does not also open the row. */
  stopPropagation?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {current && (
        <>
          <span className="text-overline text-muted-foreground">{versionText(current)}</span>
          <RevisionStatusBadge status={current.status} />
        </>
      )}
      <Link
        to={`/revisions?itemType=${itemType}&itemId=${itemId}`}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        className="inline-flex items-center gap-1 text-overline font-medium text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GitBranch className="h-3 w-3" aria-hidden="true" /> {current ? "View revisions" : "No revisions yet"}
      </Link>
    </span>
  );
}
