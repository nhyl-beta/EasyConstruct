import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader as SharedPageHeader } from "@/components/refine-ui/views/page-header";
import type { ToneBg } from "@/providers/mock-data";
import { CheckCircle2, type LucideIcon } from "lucide-react";

export function toneBg(tone: ToneBg) {
  switch (tone) {
    case "success":
      return "bg-success/10 text-success-strong";
    case "warning":
      return "bg-warning/15 text-warning-strong";
    case "destructive":
      return "bg-destructive/10 text-destructive-strong";
    case "info":
      return "bg-info/10 text-info-strong";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success-strong border-success/20",
    "On Leave": "bg-warning/15 text-warning-strong border-warning/30",
    Suspended: "bg-destructive/10 text-destructive-strong border-destructive/20",
    Archived: "bg-muted text-muted-foreground border-border",
    Verified: "bg-success/10 text-success-strong border-success/20",
    Pending: "bg-warning/15 text-warning-strong border-warning/30",
    Flagged: "bg-destructive/10 text-destructive-strong border-destructive/20",
    Approved: "bg-success/10 text-success-strong border-success/20",
    Review: "bg-destructive/10 text-destructive-strong border-destructive/20",
    Present: "bg-success/10 text-success-strong border-success/20",
    Absent: "bg-destructive/10 text-destructive-strong border-destructive/20",
    Late: "bg-warning/15 text-warning-strong border-warning/30",
    "Half Day": "bg-info/10 text-info-strong border-info/20",
    Completed: "bg-success/10 text-success-strong border-success/20",
    Processing: "bg-warning/15 text-warning-strong border-warning/30",
    Draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge
      variant="outline"
      className={`rounded-full text-overline ${map[status] ?? ""}`}
    >
      {status}
    </Badge>
  );
}

export function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

export function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "destructive";
}) {
  const color =
    tone === "success"
      ? "text-success-strong"
      : tone === "warning"
      ? "text-warning-strong"
      : "text-destructive-strong";
  return (
    <div className="rounded-lg border bg-muted/20 p-2">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-overline text-muted-foreground">{label}</div>
    </div>
  );
}

export function KpiMini({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "destructive" | "info";
  icon: LucideIcon;
}) {
  const bg =
    tone === "success"
      ? "bg-success/10 text-success-strong"
      : tone === "warning"
      ? "bg-warning/15 text-warning-strong"
      : tone === "destructive"
      ? "bg-destructive/10 text-destructive-strong"
      : "bg-info/10 text-info-strong";
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-3 text-xl font-semibold tracking-tight">{value}</div>
        <div className="text-overline text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export function Checkpoint({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
          done
            ? "border-success bg-success/15 text-success-strong"
            : "border-border text-muted-foreground"
        }`}
      >
        {done && <CheckCircle2 className="h-3 w-3" />}
      </div>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

export function Capacity({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "primary" | "info" | "warning";
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const bg =
    tone === "primary"
      ? "bg-primary"
      : tone === "info"
      ? "bg-info"
      : "bg-warning";
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// The HR pages' header: the shared PageHeader (breadcrumb, title, actions)
// behind this older `subtitle` API, so the call sites did not need to change.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return <SharedPageHeader title={title} description={subtitle} actions={actions} />;
}
