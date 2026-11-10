import { PageHeader } from "@/components/refine-ui/views/page-header";
import { UtilizationTile } from "@/components/ui/utilization-tile";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkforceSnapshot } from "@/features/workforce/hooks/useWorkforceSnapshot";
import {
  listPayroll,
  listPayrollBatches,
  type PayrollBatch,
  type PayrollLine,
} from "@/features/hr/payroll-api";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";


function StatusBadge({ status }: { status: string }) {
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

function KpiMini({
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

function Checkpoint({ label, done }: { label: string; done?: boolean }) {
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

function Capacity({
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

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

function OverviewSection() {
  // Live figures from the server (shared with the page header and Workforce tab).
  const workforce = useWorkforceSnapshot();
  const dash = workforce.loading ? "…" : null;
  const kpis = [
    {
      label: "Total employees",
      value: dash ?? String(workforce.totalEmployees),
      detail: "On record, including archived",
      icon: Users,
    },
    {
      label: "Active employees",
      value: dash ?? String(workforce.totalCapacity),
      detail: "Available workforce",
      icon: UserCheck,
    },
    {
      label: `On site, last ${workforce.windowDays} days`,
      value: dash ?? String(workforce.assignedRecently),
      detail: `${workforce.available} not yet logged`,
      icon: CalendarCheck,
    },
    {
      label: "Overtime crews",
      value: dash ?? String(workforce.overtimeCrews),
      detail: "Latest shift over 8 hours",
      icon: AlertTriangle,
    },
    {
      label: "Performance rate",
      value: dash ?? (workforce.ratedEmployees > 0 ? `${workforce.performanceRate}%` : "—"),
      detail:
        workforce.ratedEmployees > 0
          ? `Avg ${workforce.averagePerformance.toFixed(1)} / 5 · ${workforce.ratedEmployees} rated`
          : "No ratings yet",
      icon: TrendingUp,
    },
  ];

  return (
    <>
      {/* K1: cross-project gate checks (payroll/staffing) waiting on HR */}
      <WaitingOnYouCard />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
                <k.icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {k.value}
              </div>
              <div className="text-overline text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-overline text-muted-foreground/80">
                {k.detail}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function EmployeesSection() {
  // The real, paginated employee directory lives on its own page; this tab only points to it.
  const workforce = useWorkforceSnapshot();
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold">Employee directory</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {workforce.loading
              ? "Loading…"
              : `${workforce.totalEmployees} employees on record, ${workforce.totalCapacity} active.`}{" "}
            Search, filter, view records and history, archive or reassign on the Employees page.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/employees">Open employees</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AttendanceSection() {
  // The real attendance log, verification and exceptions live on their own page; this tab only points to it.
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold">Attendance</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Clock-ins, verification, geofence and photo checks, and exceptions are on the Attendance page.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/attendance">Open attendance</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PayrollSection() {
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([listPayrollBatches(), listPayroll()])
      .then(([b, l]) => {
        setBatches(b);
        setLines(l);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalGross = batches.reduce((s, b) => s + b.grossPayroll, 0);
  const totalNet = batches.reduce((s, b) => s + b.netPayroll, 0);
  const totalDeductions = batches.reduce((s, b) => s + b.deductions, 0);
  const totalOtHours = batches.reduce((s, b) => s + b.overtimeHours, 0);
  const awaitingApproval = batches.filter((b) => b.status === "pending").length;
  const baseWages = Math.max(0, totalGross - totalDeductions);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading payroll data…</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiMini
          label="Gross payroll (all batches)"
          value={`₱${totalGross.toLocaleString()}`}
          tone="info"
          icon={Wallet}
        />
        <KpiMini
          label="Net payable"
          value={`₱${totalNet.toLocaleString()}`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiMini
          label="Total OT hours"
          value={totalOtHours.toLocaleString()}
          tone="warning"
          icon={Clock}
        />
        <KpiMini
          label="Batches awaiting approval"
          value={String(awaitingApproval)}
          tone="warning"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Payroll lines (all real batches)</CardTitle>
              <p className="text-xs text-muted-foreground">
                {lines.length} employee pay lines across {batches.length} generated batches
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {lines.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No payroll generated yet. Use "Generate" on the Payroll tab of Finance's Payroll
                Review, or /payroll/generate.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.slice(0, 25).map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary-soft text-overline font-semibold text-primary-strong">
                              {p.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium">{p.name}</div>
                            <div className="font-mono text-overline text-muted-foreground">
                              {p.empId}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.role}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {p.hours}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {p.overtime}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        ₱{p.gross.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        −₱{p.deductions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        ₱{p.net.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payroll summary</CardTitle>
            <p className="text-xs text-muted-foreground">
              Real totals across every generated batch
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">Total net payable</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">
                ₱{totalNet.toLocaleString()}
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Base wages (gross − deductions)", value: totalGross > 0 ? Math.round((baseWages / totalGross) * 100) : 0, amount: `₱${baseWages.toLocaleString()}` },
                { label: "Deductions", value: totalGross > 0 ? Math.round((totalDeductions / totalGross) * 100) : 0, amount: `₱${totalDeductions.toLocaleString()}` },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{s.label}</span>
                    <span className="text-muted-foreground">{s.amount}</span>
                  </div>
                  <Progress value={s.value} className="mt-1 h-1.5" />
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2 text-xs">
              <Checkpoint label="Gross labor computed" done={batches.length > 0} />
              <Checkpoint label={`${batches.filter((b) => b.status === "approved").length} of ${batches.length} batches approved`} done={awaitingApproval === 0 && batches.length > 0} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// Part E3/C4: was 4 literal hardcoded numbers (480/418/62/17) and a
// hardcoded `workforceSites` array from providers/mock-data.ts. Real data
// via useWorkforceSnapshot (shared with admin-dashboard.tsx's
// WorkforceSnapshotCard, Part C3) — GET /employees + GET /attendance, both
// already org-wide unfiltered reads.
function WorkforceSection() {
  const w = useWorkforceSnapshot();

  if (w.loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading workforce data…</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiMini label="Active capacity" value={String(w.totalCapacity)} tone="info" icon={Users} />
        <KpiMini
          label={`Assigned (${w.windowDays}d)`}
          value={String(w.assignedRecently)}
          tone="success"
          icon={UserCheck}
        />
        <KpiMini label="Available" value={String(w.available)} tone="warning" icon={Activity} />
        <KpiMini
          label={`OT crews (${w.windowDays}d)`}
          value={String(w.overtimeCrews)}
          tone="destructive"
          icon={Clock}
        />
      </div>
      <p className="text-overline text-muted-foreground">
        "Assigned"/"OT crews" count distinct employees with a real attendance row in the last
        {" "}{w.windowDays} days (not literally "today" — this demo environment's seeded
        attendance is dated inside each project's own construction-phase timeline, not around
        today's date, so a small real number here is expected, not a bug).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Workforce allocation board
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Per-site capacity, real employee counts by `employees.site`
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {w.sites.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No active employees.</p>
          )}
          {w.sites.map((s) => {
            const util = s.capacity > 0 ? Math.round((s.assigned / s.capacity) * 100) : 0;
            return (
              <div key={s.site} className="grid items-center gap-4 rounded-lg border p-4 md:grid-cols-[220px_1fr]">
                <UtilizationTile label={s.site} percent={util} />
                <div className="space-y-3">
                  <div className="text-caption text-muted-foreground">
                    {s.assigned} assigned ({w.windowDays}d) · {s.available} available · {s.capacity} capacity
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Capacity
                      label="Assigned"
                      value={s.assigned}
                      max={Math.max(s.capacity, 1)}
                      tone="primary"
                    />
                    <Capacity
                      label="Available"
                      value={s.available}
                      max={Math.max(s.capacity, 1)}
                      tone="info"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function ReportsSection() {
  // Real reports live on the Workforce Reports page; this tab only points to it.
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold">Workforce reports</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Workforce reports and exports are on the Workforce Reports page.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/workforce-reports">Open reports</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HRDashboardPage() {
  const [tab, setTab] = useState("overview");
  const [, setShowEmployeeModal] = useState(false);
  // Two numbers for the header line, counted by the server (shared with the Workforce tab).
  const workforce = useWorkforceSnapshot();

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <PageHeader
          title="HR Dashboard"
          description={
            <>
              Current section ·{" "}
              <span className="font-medium text-foreground">{tab}</span>
            </>
          }
          actions={
            <>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> Export
              </Button>

              <Button
                size="sm"
                onClick={() => setShowEmployeeModal(true)}
                asChild
              >
                <Link to="/employees/create">
                  <Plus className="h-4 w-4" /> Add employee
                </Link>
              </Button>
            </>
          }
        />

        <TabsList className="h-10">
          <TabsTrigger value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="employees">
            Employees
          </TabsTrigger>
          <TabsTrigger value="attendance">
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll">
            Payroll
          </TabsTrigger>
          <TabsTrigger value="workforce">
            Workforce
          </TabsTrigger>
          <TabsTrigger value="reports">
            Reports
          </TabsTrigger>
        </TabsList>
        <div className="text-xs text-muted-foreground">
          {workforce.error
            ? "Live workforce data is unavailable."
            : !workforce.loading
            ? `Live workforce data · ${workforce.totalCapacity} active of ${workforce.totalEmployees} employees`
            : "Loading live workforce data…"}
        </div>

        <TabsContent value="overview" className="space-y-6">
          <OverviewSection />
        </TabsContent>
        <TabsContent value="employees" className="space-y-6">
          <EmployeesSection />
        </TabsContent>
        <TabsContent value="attendance" className="space-y-6">
          <AttendanceSection />
        </TabsContent>
        <TabsContent value="payroll" className="space-y-6">
          <PayrollSection />
        </TabsContent>
        <TabsContent value="workforce" className="space-y-6">
          <WorkforceSection />
        </TabsContent>
        <TabsContent value="reports" className="space-y-6">
          <ReportsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
