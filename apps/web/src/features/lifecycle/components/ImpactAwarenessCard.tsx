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

import { SectionCard } from "@/components/ui/section-card";
import { FEATURES } from "@/config/features";
import { LifecycleRepository } from "../repositories/lifecycle.repository";
import type { ImpactAwareness } from "../types/lifecycle.types";
import { SignalRow } from "./DecisionSupportSection";

export function ImpactAwarenessCard({ projectCode, className }: { projectCode?: string; className?: string }) {
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
          {pg.pageItems.map((p) => (
            <section key={p.projectCode} aria-label={`${p.projectName} advisories`}>
              <h4 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-sm font-medium">
                <Link to={`/projects/${encodeURIComponent(p.projectCode)}`} className="hover:underline">
                  {p.projectName}
                </Link>
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
          <DataTablePagination {...pg} compact />
        </div>
      )}
    </SectionCard>
  );
}
