// apps/web/src/pages/roles/site-personnel/sp-issues.tsx — NEW
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Clock, CheckCircle2 } from "lucide-react";
import { useMyIssues } from "@/features/issues/hooks/use-my-issues";
import { ProjectPicker } from "@/components/shared/project-picker";

const CATEGORIES = ["Technical", "Structural", "Material", "Schedule", "Resource", "Quality", "Safety", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];

export default function SPIssuesPage() {
  const { issues, counts, loading, error, submitting, report } = useMyIssues();
  const pg = usePagination(issues, 10);
  const [form, setForm] = useState({
    projectCode: "",
    title: "",
    category: "Safety",
    severity: "Medium",
    description: "",
    siteContext: "",
  });

  const canSubmit = form.projectCode && form.title && form.description.length >= 5;

  const handleSubmit = async () => {
    await report({
      issueCode: `ISS-${Date.now()}`,
      ...form,
    });
    setForm({ projectCode: "", title: "", category: "Safety", severity: "Medium", description: "", siteContext: "" });
  };

  return (
    <PageContainer>
      <PageHeader title="Issues" description="Report operational or safety issues from the field" />
      <PageContent className="p-6 md:p-8 space-y-6">
        <KpiStrip
          items={[
            { label: "Open", value: String(counts.open), icon: ShieldAlert, tone: counts.open > 0 ? "warn" : "neutral" },
            { label: "Under review", value: String(counts.underReview), icon: Clock },
            { label: "Resolved", value: String(counts.resolved), icon: CheckCircle2, tone: "good" },
          ]}
        />

        <SectionCard title="Report an issue">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <ProjectPicker
                value={form.projectCode}
                onChange={(code) => setForm((f) => ({ ...f, projectCode: code }))}
                className="h-9 w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Scaffolding instability at Level 4" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Site / location context (optional)</Label>
              <Input value={form.siteContext} onChange={(e) => setForm((f) => ({ ...f, siteContext: e.target.value }))} placeholder="Zone B, Level 4" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What did you observe? What's the risk?" />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive-strong">{error}</p>}
          <Button className="mt-4" disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? "Submitting…" : "Submit issue"}
          </Button>
        </SectionCard>

        <SectionCard title="Your reported issues">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading issues…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't reported any issues yet.</p>
          ) : (
            <div className="space-y-2">
              {pg.pageItems.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{i.issueCode} · {i.projectCode}</div>
                    <div className="text-sm font-medium">{i.title}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={i.severity} />
                    <StatusBadge status={i.status} />
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </div>
          )}
        </SectionCard>
      </PageContent>
    </PageContainer>
  );
}

SPIssuesPage.displayName = "SPIssuesPage";