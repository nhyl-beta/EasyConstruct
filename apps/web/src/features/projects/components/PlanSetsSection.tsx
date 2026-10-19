import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Layers } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { useProjectMembers } from "@/features/project-members/hooks/use-project-members";
import { formatDate } from "@/features/requests/components/RequestBadges";
import {
  DELIVERABLE_STATUSES,
  DELIVERABLE_STATUS_LABEL,
  DeliverableRepository,
  type DeliverableStatus,
  type PlanSet,
} from "../repositories/deliverable.repository";

const WRITERS = new Set(["project-manager", "architect", "consultant", "admin"]);
// What each role may move a plan set to (mirrors server lifecycle/delivery.ts canSetDeliverableStatus).
const allowedStatuses = (role: string): readonly DeliverableStatus[] =>
  role === "project-manager" || role === "admin"
    ? DELIVERABLE_STATUSES
    : role === "architect"
      ? ["not_started", "in_progress", "for_review"]
      : role === "consultant"
        ? ["in_progress", "approved"]
        : [];

/** Plan sets of a Design project: one row per discipline with its lead, sheet range, status, designs and open requests. */
export function PlanSetsSection({ projectCode }: { projectCode: string }) {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canWrite = WRITERS.has(role);
  const [sets, setSets] = useState<PlanSet[]>([]);
  const pg = usePagination(sets, 8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetDraft, setSheetDraft] = useState<Record<number, string>>({});
  const { members: architects } = useProjectMembers(projectCode, "architect");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    DeliverableRepository.list(projectCode)
      .then(setSets)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the plan sets"))
      .finally(() => setLoading(false));
  }, [projectCode]);

  useEffect(load, [load]);

  const change = async (id: number, patch: Parameters<typeof DeliverableRepository.update>[1], ok: string) => {
    try {
      await DeliverableRepository.update(id, patch);
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work");
    }
  };

  const average = sets.length ? Math.round(sets.reduce((s, d) => s + d.points, 0) / sets.length) : 0;

  return (
    <SectionCard
      title="Plan sets"
      subtitle="One per discipline being delivered. The project's progress in the Design phase is the average of these."
      badge={sets.length ? `${average}% delivered` : undefined}
      actions={<Layers className="h-4 w-4 text-muted-foreground" aria-hidden />}
    >
      {loading && sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading plan sets…</p>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive-strong">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Plan sets are created for each chosen discipline when the project moves from Proposal to Design.</p>
      ) : (
        <ul className="space-y-3">
          {pg.pageItems.map((d) => (
            <li key={d.id} className="space-y-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">{d.discipline}</h4>
                  <p className="text-overline text-muted-foreground">
                    Lead: {d.leadName ?? "not assigned"} · Sheets: {d.sheetRange || "—"}
                  </p>
                </div>
                <div className="flex w-44 items-center gap-2">
                  <Progress value={d.points} className="h-1.5 flex-1" />
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{d.points}</span>
                </div>
              </div>

              {canWrite && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select
                    value={d.status}
                    onValueChange={(v) => void change(d.id, { status: v as DeliverableStatus }, `${d.discipline}: ${DELIVERABLE_STATUS_LABEL[v as DeliverableStatus]}`)}
                    disabled={allowedStatuses(role).length === 0}
                  >
                    <SelectTrigger aria-label={`${d.discipline} status`} className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERABLE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} disabled={s !== d.status && !allowedStatuses(role).includes(s)}>
                          {DELIVERABLE_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {role !== "consultant" && (
                    <>
                      <Select
                        value={d.leadUserId ? String(d.leadUserId) : undefined}
                        onValueChange={(v) => void change(d.id, { leadUserId: Number(v) }, `${d.discipline} lead set`)}
                      >
                        <SelectTrigger aria-label={`${d.discipline} lead`} className="h-8 text-xs">
                          <SelectValue placeholder="Choose lead architect" />
                        </SelectTrigger>
                        <SelectContent>
                          {architects.map((a) => (
                            <SelectItem key={a.userId} value={String(a.userId)}>
                              {a.userName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1.5">
                        <Input
                          aria-label={`${d.discipline} sheet range`}
                          className="h-8 text-xs"
                          placeholder="e.g. A-101 to A-118"
                          value={sheetDraft[d.id] ?? d.sheetRange ?? ""}
                          onChange={(e) => setSheetDraft((cur) => ({ ...cur, [d.id]: e.target.value }))}
                          maxLength={100}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={sheetDraft[d.id] === undefined || sheetDraft[d.id] === (d.sheetRange ?? "")}
                          onClick={() => void change(d.id, { sheetRange: sheetDraft[d.id] ?? "" }, "Sheet range saved")}
                        >
                          Save
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!canWrite && <Badge variant="outline" className="rounded-full text-overline">{DELIVERABLE_STATUS_LABEL[d.status]}</Badge>}

              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="font-medium text-muted-foreground">Linked designs</p>
                  {d.designs.length === 0 ? (
                    <p className="text-muted-foreground">None yet.</p>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {d.designs.map((x) => (
                        <li key={x.id}>
                          <Link to={`/designs/${x.id}`} className="hover:underline">
                            {x.name}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            · {x.status} · {x.fileCount} file{x.fileCount === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Open requests</p>
                  {d.openRequests.length === 0 ? (
                    <p className="text-muted-foreground">None.</p>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {d.openRequests.map((r) => (
                        <li key={r.id}>
                          <Link to={`/requests?open=${r.id}`} className="font-mono hover:underline">
                            {r.number}
                          </Link>{" "}
                          <span className={r.overdue ? "text-destructive-strong" : "text-muted-foreground"}>
                            {r.dueDate ? `· due ${formatDate(r.dueDate)}` : "· draft"}
                            {r.overdue ? " · overdue" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
          <li className="list-none pt-2">
            <DataTablePagination {...pg} compact />
          </li>
        </ul>
      )}
    </SectionCard>
  );
}
