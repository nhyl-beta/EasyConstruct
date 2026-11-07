// apps/web/src/features/lifecycle/components/ImpactAwarenessCard.tsx
//
// Read-only "impact awareness": the rule-based decision-support signals of the
// projects the signed-in role can see (Architect on their staffed projects,
// Owner / IT Designer on all). Nothing here changes anything — it only links to
// where a decision is made. Hidden entirely unless FEATURE_AI is on, because
// the signals only exist then.
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { FEATURES } from "@/config/features";
import { useRoleConfig } from "@/hooks/use-role-config";
import { canAccessPath } from "@/config/route-access";
import { LifecycleRepository } from "../repositories/lifecycle.repository";
import type { ImpactAwareness } from "../types/lifecycle.types";
import { SignalRow } from "./DecisionSupportSection";

const PREVIEW_SIGNALS = 5;

/** The projects with their signals cut so that no more than `limit` advisories show in all. */
function previewProjects(projects: ImpactAwareness["projects"], limit: number): ImpactAwareness["projects"] {
  const out: ImpactAwareness["projects"] = [];
  let left = limit;
  for (const p of projects) {
    if (left <= 0) break;
    out.push({ ...p, signals: p.signals.slice(0, left) });
    left -= p.signals.length;
  }
  return out;
}

export function ImpactAwarenessCard({ projectCode, className }: { projectCode?: string; className?: string }) {
  const { identity } = useRoleConfig();
  const [data, setData] = useState<ImpactAwareness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FEATURES.ai) return;
    let active = true;
    LifecycleRepository.getImpact()
      .then((d) => active && setData(d))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load impact awareness"));
    return () => {
      active = false;
    };
  }, []);

  const projects = (data?.projects ?? []).filter((p) => !projectCode || p.projectCode === projectCode);
  const pg = usePagination(projects, 5, projectCode ?? "");
  // B-16: the card opens on a short preview (the first 5 advisories); "View all" shows the paged list.
  const [showAll, setShowAll] = useState(false);
  if (!FEATURES.ai) return null;
  const total = projects.reduce((n, p) => n + p.signals.length, 0);

  return (
    <SectionCard
      className={className}
      title="Impact awareness"
      subtitle="Rule-based advisories on cost, change, schedule and quality. Read-only; they never block a decision."
      badge={data ? (total === 0 ? "No advisories" : `${total} advisory${total === 1 ? "" : "ies"}`.replace("advisoryies", "advisories")) : undefined}
      actions={
        <span className="flex items-center gap-2">
          <DecisionSupportLabel />
          <Radar className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-strong">{error}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Checking projects…</p>
      ) : data.enabled === false ? (
        <p className="text-sm text-muted-foreground">Decision support is switched off on the server.</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs your attention on your projects right now.</p>
      ) : (
        <div className="space-y-4">
          {(showAll ? pg.pageItems : previewProjects(projects, PREVIEW_SIGNALS)).map((p) => (
            <section key={p.projectCode} aria-label={`${p.projectName} advisories`}>
              <h4 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-sm font-medium">
                {canAccessPath(identity.role, `/projects/${encodeURIComponent(p.projectCode)}`) ? (
                  <Link to={`/projects/${encodeURIComponent(p.projectCode)}`} className="hover:underline">
                    {p.projectName}
                  </Link>
                ) : (
                  <span>{p.projectName}</span>
                )}
                <span className="font-mono text-overline font-normal text-muted-foreground">
                  {p.projectCode} · {p.phase}
                </span>
              </h4>
              <ul className="space-y-1.5">
                {p.signals.map((s) => (
                  <SignalRow key={s.key} signal={s} />
                ))}
              </ul>
            </section>
          ))}
          {showAll ? (
            <DataTablePagination {...pg} compact />
          ) : (
            total > PREVIEW_SIGNALS && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(true)}>
                View all ({total})
              </Button>
            )
          )}
        </div>
      )}
    </SectionCard>
  );
}
