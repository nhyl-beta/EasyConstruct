// Employee record card: the record's details laid out as a matrix, with its
// history (every audited change) underneath. Read-only; opened from the directory.
import { useQuery } from "@tanstack/react-query";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/pages/roles/shared/shared-hr";
import { getEmployeeHistory } from "@/features/hr/hr-api";
import type { Employee } from "@/features/hr/types";
import { formatCurrency } from "@/lib/format-currency";
import { STALE } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";

const ACTION_LABEL: Record<string, string> = {
  created: "Record created",
  updated: "Record updated",
  archived: "Archived",
  reassigned: "Reassigned",
  deleted: "Record removed",
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background p-3">
      <div className="text-overline text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

export function EmployeeDetailSheet({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const history = useQuery({
    queryKey: [...qk.employees.all, "history", employee?.dbId] as const,
    queryFn: () => getEmployeeHistory(employee!.dbId),
    enabled: employee != null,
    staleTime: STALE.list,
  });

  return (
    <Sheet open={employee != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {employee && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-primary-soft text-sm font-semibold text-primary-strong">
                    {employee.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{employee.name}</SheetTitle>
                  <SheetDescription>
                    {employee.id} · {employee.role}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Employee record</h3>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                  <Cell label="Status">
                    <StatusBadge status={employee.status} />
                  </Cell>
                  <Cell label="Department">{employee.department}</Cell>
                  <Cell label="Role">{employee.role}</Cell>
                  <Cell label="Hired on">{employee.hiredOn}</Cell>
                  <Cell label="Email">
                    <span className="break-all">{employee.email || "—"}</span>
                  </Cell>
                  <Cell label="Phone">{employee.phone || "—"}</Cell>
                  <Cell label="Pay rate">
                    {formatCurrency(Number(employee.payRate))} · {employee.rateType}
                  </Cell>
                  <Cell label="Attendance rate">{employee.attendanceRate}%</Cell>
                  <Cell label="Performance">{employee.performance.toFixed(1)} / 5</Cell>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Employee history</h3>
                {history.isPending && (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                )}
                {history.isError && (
                  <p className="text-sm text-destructive-strong">The history could not be loaded.</p>
                )}
                {history.data && history.data.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No changes recorded for this employee yet. Hired {employee.hiredOn}.
                  </p>
                )}
                {history.data && history.data.length > 0 && (
                  <ol className="space-y-3 border-l pl-4">
                    {history.data.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                        <div className="text-sm font-medium">
                          {ACTION_LABEL[h.action] ?? h.action}
                        </div>
                        {h.summary && (
                          <div className="text-xs text-muted-foreground">{h.summary}</div>
                        )}
                        <div className="text-overline text-muted-foreground">
                          {formatWhen(h.createdAt)} · {h.actor}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
