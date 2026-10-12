// "My attendance and pay": a person's own attendance and approved payslips.
// Read-only. It finds the person through the real employee link on their
// account (employees.user_id); with no link there is nothing to show and the
// page says so rather than guessing from a name or an email.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { CalendarCheck, Clock, Wallet } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyRecord } from "@/features/me/hooks/use-my-record";
import { formatCurrency } from "@/lib/format-currency";

export default function MyPayPage() {
  const { link, attendance, payslips, loading, error } = useMyRecord();
  const attendancePg = usePagination(attendance, 10);
  const payslipPg = usePagination(payslips, 10);

  const present = attendance.filter((a) => ["Present", "Late", "Half Day"].includes(a.attendanceStatus)).length;
  const hours = attendance.reduce((sum, a) => sum + (a.hours ?? 0), 0);
  const latest = payslips[0];

  return (
    <PageContainer>
      <PageHeader
        title="My attendance and pay"
        description="Your own clock-ins and the payslips Finance has approved. Read-only."
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your records…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive-strong">
            Couldn't load your records. {error}
          </p>
        ) : link && !link.linked ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No employee record is linked to your account yet, so there is no attendance or pay to show. Ask HR to link your account to your
              employee record.
            </CardContent>
          </Card>
        ) : (
          <>
            <KpiStrip
              items={[
                { label: "Days worked (90 days)", value: `${present}`, icon: CalendarCheck },
                { label: "Hours (90 days)", value: hours.toFixed(1), icon: Clock },
                { label: "Approved payslips", value: `${payslips.length}`, icon: Wallet },
                { label: "Latest net pay", value: latest ? formatCurrency(latest.net) : "None yet", icon: Wallet, hint: latest?.period },
              ]}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payslips</CardTitle>
                <p className="text-xs text-muted-foreground">
                  A payslip appears once Finance approves the payroll batch it is in. Figures come from the payroll engine and are not a certified payslip.
                </p>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">SSS</TableHead>
                      <TableHead className="text-right">PhilHealth</TableHead>
                      <TableHead className="text-right">Pag-IBIG</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslips.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No approved payslips yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {payslipPg.pageItems.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {p.period}
                          {p.projectCode && <div className="font-mono text-overline text-muted-foreground">{p.projectCode}</div>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {p.hours}
                          {p.overtime ? ` + ${p.overtime} OT` : ""}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrency(p.gross)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.sss)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.philhealth)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(p.pagibig)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(p.net)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {payslips.length > 0 && (
                  <div className="px-4 pt-3">
                    <DataTablePagination {...payslipPg} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance, last 90 days</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Checked by HR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No attendance recorded in the last 90 days.
                        </TableCell>
                      </TableRow>
                    )}
                    {attendancePg.pageItems.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-sm">{a.logDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.site}</TableCell>
                        <TableCell className="font-mono text-xs">{a.clockIn}</TableCell>
                        <TableCell className="font-mono text-xs">{a.clockOut ?? "-"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{a.hours ?? "-"}</TableCell>
                        <TableCell>
                          <StatusBadge status={a.attendanceStatus} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.verification} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {attendance.length > 0 && (
                  <div className="px-4 pt-3">
                    <DataTablePagination {...attendancePg} />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}

MyPayPage.displayName = "MyPayPage";
