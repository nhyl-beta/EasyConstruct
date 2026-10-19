import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { PageHeader } from "@/pages/roles/shared/shared-hr";
import { DatePicker } from "@/components/ui/date-picker";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FairnessPanel } from "@/features/workforce/components/FairnessPanel";
import { useWorkforceBoard } from "@/features/hr/hooks/use-workforce-board";

export default function HRWorkforcePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Counts by status, department, site and day come from the server.
  const { board, loading, error } = useWorkforceBoard({ from: from || undefined, to: to || undefined });
  const totals = board.totals;
  const byDepartment = board.byDepartment;
  const bySite = board.bySite;
  const dailyAttendance = board.dailyAttendance;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <PageHeader
        title="Workforce reporting"
        subtitle="Headcount, site allocation, and attendance trends from persisted HR records"
      />

      {/* Date filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-xs text-muted-foreground">
          <span className="mb-1 block">From</span>
          <DatePicker
            value={from}
            onChange={setFrom}
            placeholder="Any start"
            className="w-44"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          <span className="mb-1 block">To</span>
          <DatePicker
            value={to}
            onChange={setTo}
            placeholder="Any end"
            className="w-44"
          />
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fairness">Fairness</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
      {/* Loading */}
      {loading && (
        <p className="text-sm text-muted-foreground">
          Loading workforce data…
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive-strong">
          {error}
        </p>
      )}

      {/* Workforce summary */}
      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Headcount", totals.headcount],
              ["Active", totals.active],
              ["On leave", totals.onLeave],
              ["Suspended", totals.suspended],
              ["Attendance records", totals.attendanceRecords],
            ].map(([label, value]) => (
              <Card
                key={String(label)}
               
              >
                <CardContent className="p-4">
                  <div className="text-2xl font-semibold">
                    {value}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {label}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Department and Site */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  By department
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                {byDepartment.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No employee records found.
                  </p>
                ) : (
                  byDepartment.map((row) => (
                    <div
                      key={row.department}
                      className="flex items-center justify-between border-b py-2 text-sm last:border-0"
                    >
                      <span>{row.department}</span>

                      <span className="text-muted-foreground">
                        {row.active} active / {row.headcount} total
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  By site
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                {bySite.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No site assignments found.
                  </p>
                ) : (
                  bySite.map((row) => (
                    <div
                      key={row.site}
                      className="flex items-center justify-between border-b py-2 text-sm last:border-0"
                    >
                      <span>{row.site}</span>

                      <span className="text-muted-foreground">
                        {row.present} present / {row.headcount} assigned
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Daily attendance
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {dailyAttendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attendance records in the selected range.
                </p>
              ) : (
                dailyAttendance.map((row) => (
                  <div
                    key={row.date}
                    className="grid grid-cols-4 border-b py-2 text-sm last:border-0"
                  >
                    <span>{row.date}</span>

                    <span className="text-success-strong">
                      Present {row.present}
                    </span>

                    <span className="text-warning-strong">
                      Late {row.late}
                    </span>

                    <span className="text-destructive-strong">
                      Absent {row.absent}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>
        <TabsContent value="fairness">
          <FairnessPanel dateFrom={from || undefined} dateTo={to || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
