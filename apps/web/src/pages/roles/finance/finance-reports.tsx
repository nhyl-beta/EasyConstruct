// apps/web/src/pages/finance/finance-reports.tsx
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/ui/section-card";
import { useFinanceReportsController } from "@/features/finance/hooks/use-finance-reports";
import {
  Activity,
  Calendar,
  ClipboardList,
  Download,
  FileSearch,
  Printer,
  Receipt,
  Share2,
  TrendingUp,
  Wallet,
} from "lucide-react";

const REPORT_TYPES = [
  {
    id: "RPT-BUD",
    title: "Budget Reports",
    desc: "Planned vs committed vs actual, by project and FY.",
    icon: Wallet,
  },
  {
    id: "RPT-EXP",
    title: "Expense Reports",
    desc: "Operational expenses, vendor breakdown, anomalies.",
    icon: Receipt,
  },
  {
    id: "RPT-PAY",
    title: "Payroll Review Reports",
    desc: "Approved batches, variance, labor cost analytics.",
    icon: ClipboardList,
  },
  {
    id: "RPT-CF",
    title: "Cash Flow Reports",
    desc: "Inflow vs outflow, rolling 6/12 months.",
    icon: Activity,
  },
  {
    id: "RPT-PL",
    title: "Profit & Loss",
    desc: "Portfolio P&L by project and category.",
    icon: TrendingUp,
  },
  {
    id: "RPT-FC",
    title: "Forecast Reports",
    desc: "AI-augmented financial forecasts and scenarios.",
    icon: TrendingUp,
  },
  {
    id: "RPT-EX",
    title: "Executive Financial Reports",
    desc: "Board-ready financial summary pack.",
    icon: FileSearch,
  },
];

export default function FinanceReportsPage() {
  const c = useFinanceReportsController();

  return (
    <PageContainer>
      <PageHeader
        title="Financial Reports"
        description="Export-ready financial reporting with scheduled distribution to stakeholders."
      />
      <PageContent className="space-y-6 p-4 md:p-8">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {REPORT_TYPES.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success-strong ring-1 ring-success/20">
                    <r.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{r.title}</div>
                    <div className="font-mono text-overline text-muted-foreground">
                      {r.id}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => c.exportReport(r.id, "pdf")}
                  >
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => c.exportReport(r.id, "excel")}
                  >
                    <Download className="h-3 w-3" /> Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                  >
                    <Printer className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                  >
                    <Share2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                  >
                    <Calendar className="h-3 w-3" /> Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <SectionCard
          title="Scheduled reports"
          subtitle="Auto-distributed to stakeholders"
        >
          {c.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted/40"
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {c.scheduledReports.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <span>{s.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.cadence} · {s.time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </PageContent>
    </PageContainer>
  );
}

FinanceReportsPage.displayName = "FinanceReportsPage";
