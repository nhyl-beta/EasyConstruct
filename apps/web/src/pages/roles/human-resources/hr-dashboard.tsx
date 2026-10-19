import { FEATURES } from "@/config/features";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { UtilizationTile } from "@/components/ui/utilization-tile";
import { RingGauge } from "@/components/ui/ring-gauge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  attendanceLogs,
  attendanceWeek,
  departments,
  employees,
  hrAIInsights,
  hrActivity,
  hrNotifications,
  hrReports,
  type Employee,
  type ToneBg,
} from "@/providers/mock-data";
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
  Bell,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileBarChart2,
  Filter,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";


function toneBg(tone: ToneBg) {
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

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

function MiniStat({
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
// AI Insights Card
// ─────────────────────────────────────────────────────────────────────────────

function AIInsightsCard() {
  return (
    <Card className="border-ai/20 bg-gradient-to-b from-ai-soft/60 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ai text-ai-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">AI HR assistant</CardTitle>
            <p className="text-xs text-muted-foreground">
              Advisory — review before acting
            </p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full border-ai/30 text-ai">
          Live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {hrAIInsights.map((i) => (
          <div
            key={i.title}
            className="rounded-xl border border-ai/15 bg-background/60 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium leading-snug">{i.title}</div>
              <Badge variant="outline" className="rounded-full text-overline">
                {Math.round(i.confidence * 100)}% conf.
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-overline text-muted-foreground">
                <span className="font-medium text-foreground">Impact:</span>{" "}
                {i.impact}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-ai hover:bg-ai-soft"
              >
                {i.action} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

function OverviewSection() {
  const kpis = [
    {
      label: "Total employees",
      value: "518",
      delta: "+12 this month",
      up: true,
      icon: Users,
    },
    {
      label: "Active today",
      value: "478",
      delta: "92.3% attendance",
      up: true,
      icon: UserCheck,
    },
    {
      label: "Absent / on leave",
      value: "40",
      delta: "-6 vs yesterday",
      up: true,
      icon: UserX,
    },
    {
      label: "Open attendance issues",
      value: "14",
      delta: "+3 needs review",
      up: false,
      icon: AlertTriangle,
    },
    {
      label: "Payroll cycle",
      value: "73%",
      delta: "Cut-off in 2 days",
      up: true,
      icon: Wallet,
    },
    {
      label: "Avg attendance rate",
      value: "94.8%",
      delta: "+1.2 pts MoM",
      up: true,
      icon: CalendarCheck,
    },
  ];

  return (
    <>
      {/* K1: cross-project gate checks (payroll/staffing) waiting on HR */}
      <WaitingOnYouCard />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
                  <k.icon className="h-4 w-4" />
                </div>
                {k.up ? (
                  <TrendingUp className="h-3.5 w-3.5 text-success-strong" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-warning-strong" />
                )}
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {k.value}
              </div>
              <div className="text-overline text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-overline text-muted-foreground/80">
                {k.delta}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + AI */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Weekly attendance</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Present · late · absent across all active sites
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              This week
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-3">
              {attendanceWeek.map((d) => {
                const max = 530;
                return (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div className="flex h-44 w-full flex-col-reverse overflow-hidden rounded-lg border bg-muted/30">
                      <div
                        className="bg-primary"
                        style={{ height: `${(d.present / max) * 100}%` }}
                        title={`Present ${d.present}`}
                      />
                      <div
                        className="bg-warning/80"
                        style={{ height: `${(d.late / max) * 100}%` }}
                        title={`Late ${d.late}`}
                      />
                      <div
                        className="bg-destructive/70"
                        style={{ height: `${(d.absent / max) * 100}%` }}
                        title={`Absent ${d.absent}`}
                      />
                    </div>
                    <div className="text-overline font-medium text-muted-foreground">
                      {d.day}
                    </div>
                    <div className="text-overline text-muted-foreground/70">
                      {d.present + d.late + d.absent}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-overline text-muted-foreground">
              <Legend dot="bg-primary" label="Present" />
              <Legend dot="bg-warning/80" label="Late" />
              <Legend dot="bg-destructive/70" label="Absent" />
            </div>
          </CardContent>
        </Card>
        {FEATURES.aiPlaceholders && <AIInsightsCard />}
      </div>

      {/* Department + Payroll + Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Department allocation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department allocation</CardTitle>
            <p className="text-xs text-muted-foreground">
              Headcount by department
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {departments.map((d) => {
              const total = departments.reduce((s, x) => s + x.count, 0);
              const pct = Math.round((d.count / total) * 100);
              return (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">
                      {d.count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${d.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payroll status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Payroll status</CardTitle>
            <Badge variant="secondary" className="rounded-full">
              Period · Jun 1–15
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-semibold tracking-tight">
                    ₱2.84M
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Gross labor (period)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-success-strong">+4.1%</div>
                  <div className="text-overline text-muted-foreground">
                    vs last period
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <RingGauge percent={73} label="Payroll reviewed" size={88} />
                <div className="text-caption text-muted-foreground">
                  <div>73% reviewed</div>
                  <div>Cut-off in 2d 6h</div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Approved" value="378" tone="success" />
              <MiniStat label="Pending" value="124" tone="warning" />
              <MiniStat label="Review" value="16" tone="destructive" />
            </div>
          </CardContent>
        </Card>

        {/* Recent HR activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent HR activity</CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest changes across people ops
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {hrActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg ${toneBg(
                    a.tone,
                  )}`}
                >
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.text}</p>
                  <p className="text-overline text-muted-foreground">
                    {a.time} ago
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EmployeesSection() {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(
    () =>
      employees.filter((e) => {
        const q = query.toLowerCase();
        const matchQ =
          !query ||
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.role.toLowerCase().includes(q);
        const matchD = dept === "all" || e.department === dept;
        const matchS = status === "all" || e.status === status;
        return matchQ && matchD && matchS;
      }),
    [query, dept, status],
  );

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, ID, or role…"
              className="h-9 border-border bg-muted/40 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-9 w-[170px]">
                <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.name} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Leave">On Leave</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Employee directory</CardTitle>
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {employees.length} employees · bulk actions
              available
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Archive
            </Button>
            <Button variant="outline" size="sm">
              Reassign
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Employee</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Perf.</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <EmployeeRow key={e.id} e={e} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function EmployeeRow({ e }: { e: Employee }) {
  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-strong">
              {e.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{e.name}</div>
            <div className="truncate text-overline text-muted-foreground">
              Hired {e.hiredOn}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {e.id}
      </TableCell>
      <TableCell className="text-sm">{e.role}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {e.department}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{e.site}</TableCell>
      <TableCell>
        <StatusBadge status={e.status} />
      </TableCell>
      <TableCell className="text-right">
        <span
          className={
            e.attendanceRate >= 95
              ? "text-success-strong"
              : e.attendanceRate >= 85
              ? "text-warning-strong"
              : "text-destructive-strong"
          }
        >
          {e.attendanceRate}%
        </span>
      </TableCell>
      <TableCell className="text-right text-sm">
        {e.performance.toFixed(1)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Edit record</DropdownMenuItem>
            <DropdownMenuItem>Employment history</DropdownMenuItem>
            <DropdownMenuItem>Documents</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive-strong">
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function AttendanceSection() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiMini
          label="Verified today"
          value="436"
          tone="success"
          icon={CheckCircle2}
        />
        <KpiMini
          label="Pending verification"
          value="28"
          tone="warning"
          icon={Clock}
        />
        <KpiMini
          label="Geofence flags"
          value="9"
          tone="destructive"
          icon={MapPin}
        />
        <KpiMini
          label="Photo auth failures"
          value="5"
          tone="destructive"
          icon={Camera}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                Today's attendance log
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Clock-ins, geofence and photo authentication results
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline">
                Bulk verify
              </Button>
              <Button size="sm">
                <ShieldCheck className="h-4 w-4" /> Resolve flags
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Clock in</TableHead>
                  <TableHead>Clock out</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Geofence</TableHead>
                  <TableHead>Photo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceLogs.map((l) => (
                  <TableRow key={l.empId} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary-soft text-overline font-semibold text-primary-strong">
                            {l.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{l.name}</div>
                          <div className="font-mono text-overline text-muted-foreground">
                            {l.empId}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.site}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.clockIn}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.clockOut}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {l.hours.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-overline ${
                          l.geofence === "Inside"
                            ? "border-success/30 text-success-strong"
                            : l.geofence === "Edge"
                            ? "border-warning/30 text-warning-strong"
                            : "border-destructive/30 text-destructive-strong"
                        }`}
                      >
                        <MapPin className="mr-1 h-3 w-3" /> {l.geofence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-overline ${
                          l.photo === "Verified"
                            ? "border-success/30 text-success-strong"
                            : l.photo === "Pending"
                            ? "border-warning/30 text-warning-strong"
                            : "border-destructive/30 text-destructive-strong"
                        }`}
                      >
                        <Camera className="mr-1 h-3 w-3" /> {l.photo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site heatmap</CardTitle>
            <p className="text-xs text-muted-foreground">
              Attendance density · last 14 days
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                "Westgate Tower",
                "Harborline Hub",
                "Northgate Plaza",
                "Phoenix HQ",
              ].map((site) => (
                <div key={site}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{site}</span>
                    <span className="text-muted-foreground">14d</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const intensity = Math.round(40 + Math.random() * 60);
                      return (
                        <div
                          key={i}
                          className="h-5 flex-1 rounded-sm"
                          style={{
                            backgroundColor: `color-mix(in oklch, var(--color-primary) ${intensity}%, transparent)`,
                          }}
                          title={`Day ${i + 1}: ${intensity}%`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">On-time rate</span>
                <span className="font-medium text-success-strong">91.4%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Late arrivals (avg)
                </span>
                <span className="font-medium">18 / day</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg shift length</span>
                <span className="font-medium">9.4 h</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// Part E3/C4: was 4 hardcoded KPIs, a hardcoded "Payroll batch B-118" table
// (payrollRows, mock-data.ts), and a hardcoded "Period summary" distribution
// (78/6/4/12% — never computed from anything). Real data: listPayrollBatches
// (payroll_batches, real grossPayroll/netPayroll/deductions/overtimeHours/
// status columns) for the KPIs/summary, listPayroll (payroll lines) for the
// per-employee table — both already-real endpoints (see
// apps/web/src/features/hr/payroll-api.ts), generated by the already-verified
// POST /payroll/generate → real SSS/PhilHealth/Pag-IBIG math.
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
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {hrReports.map((r) => (
          <Card key={r.title}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
                  <FileBarChart2 className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="rounded-full text-overline">
                  {r.tag}
                </Badge>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{r.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Button size="sm" variant="ghost">
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications center</CardTitle>
          <p className="text-xs text-muted-foreground">
            HR alerts requiring action
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {hrNotifications.map((n, i) => (
            <div
              key={i}
              className="flex items-start justify-between rounded-xl border bg-muted/20 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneBg(
                    n.tone,
                  )}`}
                >
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-overline text-muted-foreground">
                    {n.time}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="ghost">
                Review
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
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
