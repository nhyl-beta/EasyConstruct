import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardList, Paperclip, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openFileUrl } from "@/lib/file-url";
import { RequirementRepository } from "../repositories/requirement.repository";
import type { Requirement } from "../types/requirements.types";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";
import { useAuth } from "@/auth/auth-context";
import { OverrideReasonDialog } from "@/components/shared/override-reason-dialog";

/**
 * Requirements an Engineer has submitted (status "Under Review") and that are
 * waiting on the Project Manager. Lives on the Approvals page so a submitted
 * draft shows up where the PM already looks for things to decide. The server
 * scopes the list to the caller's own projects.
 */
export function RequirementApprovalsPanel() {
  const [items, setItems] = useState<Requirement[]>([]);
  const pg = usePagination(items, 8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Deciding belongs to the project's PM; an Admin gets an Override with a written reason (change #9).
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [overriding, setOverriding] = useState<{ dbId: number; status: "Approved" | "Rejected" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await RequirementRepository.list({ status: "Under Review" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requirements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (dbId: number, status: "Approved" | "Rejected", overrideReason?: string) => {
    setBusyId(dbId);
    setError(null);
    try {
      await RequirementRepository.setStatus(dbId, status, overrideReason);
      setItems((prev) => prev.filter((r) => r.dbId !== dbId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update requirement.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Requirements awaiting approval
          {items.length > 0 && (
            <Badge variant="outline" className="rounded-full text-overline">{items.length}</Badge>
          )}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Requirements Engineers have submitted for review on your projects.
        </p>
      </div>

      {error && <p className="text-sm text-destructive-strong">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>
      ) : (
        <ul className="space-y-2">
          {pg.pageItems.map((r) => (
            <li key={r.dbId} className="space-y-1.5 rounded-xl border border-border px-4 py-3">
              <div className="font-mono text-xs text-muted-foreground">
                {r.id} · {r.project} · {r.category}
              </div>
              <div className="text-sm font-medium">{r.title}</div>
              <p className="text-sm text-muted-foreground">{r.description}</p>
              {r.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {r.attachments.map((a) => (
                    <li key={a.url} className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-primary-strong hover:bg-muted/40"
                        onClick={() => void openFileUrl(a.url).catch((err: Error) => setError(err.message))}
                      >
                        <Paperclip className="h-3 w-3" /> {a.filename}
                      </button>
                      <FileIntegrityBadge url={a.url} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-muted-foreground">
                  {r.createdBy} · {r.updatedAgo}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" disabled={busyId === r.dbId} onClick={() => (isAdmin ? setOverriding({ dbId: r.dbId, status: "Approved" }) : void decide(r.dbId, "Approved"))}>
                    <Check className="h-3 w-3" /> {isAdmin ? "Override: approve" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive-strong" disabled={busyId === r.dbId} onClick={() => (isAdmin ? setOverriding({ dbId: r.dbId, status: "Rejected" }) : void decide(r.dbId, "Rejected"))}>
                    <X className="h-3 w-3" /> {isAdmin ? "Override: reject" : "Reject"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
          <div className="pt-2">
            <DataTablePagination {...pg} compact />
          </div>
        </ul>
      )}
      <OverrideReasonDialog
        open={overriding !== null}
        onOpenChange={(o) => !o && setOverriding(null)}
        title={overriding ? `Override: ${overriding.status === "Approved" ? "approve" : "reject"} this requirement` : "Override"}
        description="Deciding a requirement is the Project Manager's call. Give the reason you are stepping in; it is kept in the audit trail."
        confirmLabel={overriding?.status === "Approved" ? "Approve as Admin" : "Reject as Admin"}
        busy={overriding !== null && busyId === overriding.dbId}
        error={error}
        onConfirm={(reason) => {
          if (!overriding) return;
          void decide(overriding.dbId, overriding.status, reason).then(() => setOverriding(null));
        }}
      />
    </section>
  );
}

RequirementApprovalsPanel.displayName = "RequirementApprovalsPanel";
