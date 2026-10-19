import { useEffect, useState } from "react";
import { GitCompare, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/auth/auth-context";
import { useRevisionHistory } from "../hooks/useRevisionHistory";
import type { Revision, RevisionItemType } from "../types/revision.types";
import { CompareDialog } from "./CompareDialog";
import { ItemTypeBadge } from "./RevisionBadges";
import { versionText } from "../lib/revision-format";
import { RevisionFilePreview } from "./RevisionFilePreview";
import { VersionHistory } from "./VersionHistory";

const REVIEWER_ROLES = new Set(["consultant", "project-manager", "admin"]);

/** Drawer with every version of one item: timeline, preview, download, compare, and (reviewers) decisions. */
export function VersionHistorySheet({
  item,
  onOpenChange,
  onChanged,
  onNewVersion,
}: {
  item: { itemType: RevisionItemType; itemId: number } | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a reviewer changes a status, so lists can refresh. */
  onChanged?: () => void;
  /** Architect / Admin: upload a new version of this item. */
  onNewVersion?: (item: { itemType: RevisionItemType; itemId: number }, projectCode: string) => void;
}) {
  const { user } = useAuth();
  const h = useRevisionHistory(item?.itemType ?? null, item?.itemId ?? null);
  const [previewing, setPreviewing] = useState<Revision | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [comparing, setComparing] = useState<[number, number] | null>(null);

  useEffect(() => {
    setSelected([]);
    setComparing(null);
  }, [item?.itemType, item?.itemId]);

  const head = h.versions[0];
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? cur : [...cur, id]));

  return (
    <>
      <Sheet open={item !== null} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              {head?.itemTitle ?? "Version history"}
              {head && <ItemTypeBadge type={head.itemType} />}
            </SheetTitle>
            <SheetDescription>
              {head
                ? `${head.projectCode} · ${h.versions.length} version${h.versions.length === 1 ? "" : "s"}`
                : "Every version of this item, newest first."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            {onNewVersion && item && head && (
              <Button size="sm" onClick={() => onNewVersion(item, head.projectCode)}>
                <Plus className="h-3.5 w-3.5" /> New version
              </Button>
            )}
            {h.loading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
              </div>
            )}
            {h.error && (
              <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
                <p>{h.error}</p>
                <Button size="sm" variant="outline" onClick={() => void h.reload()}>
                  Retry
                </Button>
              </div>
            )}
            {!h.loading && !h.error && h.versions.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">No versions have been recorded for this item.</p>
            )}

            {h.versions.length > 1 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {selected.length === 2 ? "Two versions selected." : "Tick two versions to compare them."}
                </span>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={selected.length !== 2}
                  onClick={() => setComparing([selected[0]!, selected[1]!])}
                >
                  <GitCompare className="h-3 w-3" /> Compare selected
                </Button>
              </div>
            )}

            {h.versions.length > 0 && (
              <VersionHistory
                versions={h.versions}
                canReview={!!user && REVIEWER_ROLES.has(user.role)}
                saving={h.saving}
                actionError={h.actionError}
                onReview={async (id, status, comment) => {
                  const ok = await h.setStatus(id, status, comment);
                  if (ok) onChanged?.();
                  return ok;
                }}
                onPreview={setPreviewing}
                selected={selected}
                onToggleSelect={h.versions.length > 1 ? toggle : undefined}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={previewing !== null} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewing?.itemTitle} — {previewing ? versionText(previewing) : ""}
            </DialogTitle>
            <DialogDescription>{previewing?.fileName}</DialogDescription>
          </DialogHeader>
          {previewing && <RevisionFilePreview revision={previewing} className="h-[28rem]" />}
        </DialogContent>
      </Dialog>

      <CompareDialog
        leftId={comparing?.[0] ?? null}
        rightId={comparing?.[1] ?? null}
        onOpenChange={(open) => !open && setComparing(null)}
      />
    </>
  );
}
