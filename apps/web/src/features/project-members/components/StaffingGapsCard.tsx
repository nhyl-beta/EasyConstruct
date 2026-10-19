// F7: org-wide view of "staffed but not linked to an Active employee
// record" — the same gap gate C4 checks per-project, surfaced here across
// every project so IT Designer can fix accounts before a PM ever hits the
// blocked Advance for it.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useState } from "react";
import { AlertTriangle, UserX } from "lucide-react";
import { apiClient } from "@/services/api.client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectMemberRow {
  id: number;
  projectCode: string;
  userId: number;
  userName: string;
  role: string;
}

interface EmployeeRow {
  userId: number | null;
  status: string;
}

interface Gap {
  key: string;
  projectCode: string;
  userName: string;
  role: string;
  reason: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export function StaffingGapsCard() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const pg = usePagination(gaps, 8);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      unwrap<ProjectMemberRow[]>(apiClient.get("/project-members")),
      unwrap<EmployeeRow[]>(apiClient.get("/employees")),
    ])
      .then(([members, employees]) => {
        if (cancelled) return;
        const activeUserIds = new Set(
          employees.filter((e) => e.userId != null && e.status === "Active").map((e) => e.userId),
        );
        setGaps(
          members
            .filter((m) => !activeUserIds.has(m.userId))
            .map((m) => ({
              key: `${m.projectCode}-${m.userId}-${m.role}`,
              projectCode: m.projectCode,
              userName: m.userName,
              role: m.role,
              reason: "No Active employee record linked to this login",
            })),
        );
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && gaps.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning-strong" />
          Staffed but not linked to an employee
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking staffing…</p>
        ) : (
          <ul className="space-y-1.5">
            {pg.pageItems.map((g) => (
              <li key={g.key} className="flex items-center gap-2 text-sm">
                <UserX className="h-3.5 w-3.5 shrink-0 text-warning-strong" />
                <span className="font-medium">{g.userName}</span>
                <span className="text-muted-foreground">
                  · {g.role} on {g.projectCode} · {g.reason}
                </span>
              </li>
            ))}
            <div className="pt-2">
              <DataTablePagination {...pg} compact />
            </div>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

StaffingGapsCard.displayName = "StaffingGapsCard";
