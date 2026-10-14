// client/src/features/lifecycle/components/DecisionSupportSection.tsx — NEW (ai-signals E2)
//
// Purely informational — nothing in here calls advance/decide or any other
// mutation. Rendered beneath the gate checklist in ProjectLifecyclePanel,
// visibly separate (own heading, divider, muted background) so it can never
// be mistaken for part of the gate checks above it.
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { Link } from "react-router";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Signal, Severity } from "../types/lifecycle.types";

const SEVERITY_STYLE: Record<Severity, { className: string; icon: typeof Info; label: string }> = {
  critical: { className: "border-destructive/30 bg-destructive/10 text-destructive-strong", icon: AlertTriangle, label: "Critical" },
  warn: { className: "border-warning/30 bg-warning/10 text-warning-strong", icon: TriangleAlert, label: "Warning" },
  info: { className: "border-info/30 bg-info/10 text-info-strong", icon: Info, label: "Info" },
};

export function SignalRow({ signal }: { signal: Signal }) {
  const style = SEVERITY_STYLE[signal.severity];
  const Icon = style.icon;

  return (
    <li className="flex items-start gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
      <Badge variant="outline" className={`mt-0.5 shrink-0 gap-1 rounded-full text-overline ${style.className}`}>
        <Icon className="h-3 w-3" />
        {style.label}
      </Badge>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium leading-snug">{signal.label}</p>
        <p className="text-xs text-muted-foreground">{signal.detail}</p>
        {signal.suggestedResolution && (
          <p className="text-xs text-foreground/80">
            <span className="font-medium">Suggested:</span> {signal.suggestedResolution.action}
          </p>
        )}
        {signal.suggestedResolution?.precedents?.map((p) => (
          <p key={p.issueCode} className="text-overline text-muted-foreground">
            Similar resolved issue {p.issueCode} ({Math.round(p.score * 100)}% match): {p.resolutionNotes.slice(0, 160)}
          </p>
        ))}
        {signal.sources && signal.sources.length > 0 && (
          <p className="text-overline text-muted-foreground/80">
            {signal.sources
              .map((s) => `Cost reference: ${s.source}${s.fetchedAt ? `, fetched ${s.fetchedAt.slice(0, 10)}` : ""}`)
              .join(" · ")}
          </p>
        )}
        {signal.link && (
          <Link to={signal.link} className="inline-block text-xs font-medium text-primary-strong hover:underline">
            Go to {signal.link.replace(/^\//, "")}
          </Link>
        )}
      </div>
    </li>
  );
}

export function DecisionSupportSection({ signals }: { signals: Signal[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-ai/20 bg-ai-soft/30 p-3">
      <div className="flex items-center gap-2">
        <DecisionSupportLabel />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground">Decision support</p>
          <p className="text-overline text-muted-foreground">Rule-based advisories — they never block approval.</p>
        </div>
      </div>

      {signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No advisories for this phase.</p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} />
          ))}
        </ul>
      )}
    </div>
  );
}

DecisionSupportSection.displayName = "DecisionSupportSection";
