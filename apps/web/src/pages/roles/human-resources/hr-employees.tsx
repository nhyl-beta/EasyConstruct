import { useIsReadOnlyAdmin } from "@/hooks/use-read-only-admin";
import { Download, Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Link } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { PageHeader, StatusBadge } from "@/pages/roles/shared/shared-hr";
import { departments } from "@/providers/mock-data";
import {
  deactivateEmployee,
  deleteEmployee,
  listEmployeesAll,
  listEmployeesPage,
  updateEmployee,
} from "@/features/hr/hr-api";
import { EmployeeDetailSheet } from "@/features/hr/components/EmployeeDetailSheet";
import type { Employee } from "@/features/hr/types";
import { downloadCsv } from "@/lib/export-csv";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { useWorkforceSnapshot } from "@/features/workforce/hooks/useWorkforceSnapshot";

function EmployeeRow({
  e,
  selected,
  onSelect,
  onView,
  onArchive,
  onDelete,
}: {
  e: Employee;
  selected: boolean;
  onSelect: (e: Employee, checked: boolean) => void;
  onView: (e: Employee) => void;
  onArchive: (e: Employee) => void;
  onDelete: (e: Employee) => void;
}) {
  const readOnly = useIsReadOnlyAdmin();
  return (
    <TableRow className="hover:bg-muted/40" data-state={selected ? "selected" : undefined}>
      {!readOnly && (
        <TableCell className="w-10">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelect(e, v === true)}
            aria-label={`Select ${e.name}`}
          />
        </TableCell>
      )}
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
            {!readOnly && (
              <DropdownMenuItem asChild>
                <Link to={`/employees/${e.dbId}/edit`}>Edit record</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onView(e)}>
              Record &amp; history
            </DropdownMenuItem>
            {!readOnly && (
              <>
                <DropdownMenuSeparator />
                {e.status !== "Archived" && (
                  <DropdownMenuItem onSelect={() => onArchive(e)}>
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive-strong"
                  onSelect={() => onDelete(e)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function HREmployeesPage() {
  const readOnly = useIsReadOnlyAdmin();
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Map<number, Employee>>(new Map());
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignDept, setReassignDept] = useState("");
  const [reassignRole, setReassignRole] = useState("");
  const [busy, setBusy] = useState(false);
  // B-105: the app's own confirm dialog, not the browser's window.confirm.
  const [pending, setPending] = useState<{ title: string; description: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  // Search (debounced), the two filters and paging all go to the server; the
  // total headcount in the card header is the shared workforce figure.
  const pagination = useServerList<Employee>({
    key: (params) => qk.employees.list(params),
    fetchPage: (params) =>
      listEmployeesPage({ page: params.page, limit: params.limit, search: params.search, department: dept, status }),
    filters: { dept, status },
  });
  const workforce = useWorkforceSnapshot();
  const loading = pagination.loading;
  const error = pagination.error?.message ?? null;
  const query = pagination.searchInput;
  const setQuery = pagination.setSearchInput;

  // Deactivate / delete go through apiClient, which invalidates the employee
  // queries: the table refetches itself.
  const handleArchive = async (e: Employee) => {
    await deactivateEmployee(e.dbId);
    // The record's status is now Archived: keep the selection and open card in step.
    setSelected((prev) => {
      if (!prev.has(e.dbId)) return prev;
      const next = new Map(prev);
      next.set(e.dbId, { ...e, status: "Archived" });
      return next;
    });
  };

  const chosen = Array.from(selected.values());
  const toggleOne = (e: Employee, checked: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(e.dbId, e);
      else next.delete(e.dbId);
      return next;
    });
  const pageIds = pagination.pageItems.map((e) => e.dbId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAllOnPage = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const e of pagination.pageItems) {
        if (checked) next.set(e.dbId, e);
        else next.delete(e.dbId);
      }
      return next;
    });

  // Bulk archive: each employee's status becomes Archived on the server.
  const handleBulkArchive = () => {
    const targets = chosen.filter((e) => e.status !== "Archived");
    if (targets.length === 0) {
      toast.info("The selected employees are already archived.");
      return;
    }
    const plural = `${targets.length} employee${targets.length === 1 ? "" : "s"}`;
    setPending({
      title: `Archive ${plural}?`,
      description: "Archived employees stop appearing in active lists. You can reassign them later.",
      confirmLabel: "Archive",
      run: async () => {
        setBusy(true);
        const results = await Promise.allSettled(targets.map((e) => deactivateEmployee(e.dbId)));
        setBusy(false);
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) toast.error(`${failed} of ${targets.length} could not be archived.`);
        else toast.success(`Archived ${plural}.`);
        setSelected(new Map());
      },
    });
  };

  // Bulk reassign: new department (and optionally role). An archived employee who is
  // reassigned is going back to work, so their status is set back to Active in the
  // same update; otherwise the record would show a department but stay Archived.
  const archivedChosen = chosen.filter((e) => e.status === "Archived").length;
  const handleReassign = async () => {
    if (!reassignDept) return;
    setBusy(true);
    const results = await Promise.allSettled(
      chosen.map((e) =>
        updateEmployee(e.dbId, {
          department: reassignDept,
          ...(reassignRole.trim() ? { role: reassignRole.trim() } : {}),
          ...(e.status === "Archived" ? { status: "Active" as const } : {}),
        }),
      ),
    );
    setBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(`${failed} of ${chosen.length} could not be reassigned.`);
    else toast.success(`Reassigned ${chosen.length} employee${chosen.length === 1 ? "" : "s"} to ${reassignDept}.`);
    setReassignOpen(false);
    setReassignDept("");
    setReassignRole("");
    setSelected(new Map());
  };

  const handleDelete = (e: Employee) =>
    setPending({
      title: `Delete ${e.name}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      run: async () => {
        await deleteEmployee(e.dbId);
      },
    });

  const handleExportCsv = async () => {
    // Export covers everything the filters select, not just the page on screen.
    const rows = await listEmployeesAll({ search: pagination.search, department: dept, status });
    downloadCsv(
      "employees",
      ["Employee ID", "Name", "Role", "Department", "Status", "Hired On", "Email", "Phone"],
      rows.map((e) => [
        e.id,
        e.name,
        e.role,
        e.department,
        e.status,
        e.hiredOn,
        e.email,
        e.phone,
      ]),
    );
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <PageHeader
        title="Employees"
        subtitle="Directory, roles, and workforce records"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={pagination.total === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {!readOnly && (
              <Button size="sm" asChild>
                <Link to="/employees/create">
                  <Plus className="h-4 w-4" /> Add employee
                </Link>
              </Button>
            )}
          </>
        }
      />

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
              <SelectTrigger className="h-9 w-42.5">
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
              <SelectTrigger className="h-9 w-35">
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
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={pagination.total === 0}>
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
              {loading ? "Loading…" : `${pagination.total} of ${workforce.totalEmployees} employees`}
              {chosen.length > 0 ? ` · ${chosen.length} selected` : " · select employees for bulk actions"}
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={chosen.length === 0 || busy}
                onClick={() => void handleBulkArchive()}
              >
                Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={chosen.length === 0 || busy}
                onClick={() => setReassignOpen(true)}
              >
                Reassign
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                {!readOnly && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPage}
                      onCheckedChange={(v) => toggleAllOnPage(v === true)}
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[260px]">Employee</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Perf.</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={readOnly ? 8 : 9} className="py-8 text-center text-sm text-destructive-strong">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && !loading && pagination.total === 0 && (
                <TableRow>
                  <TableCell colSpan={readOnly ? 8 : 9} className="py-8 text-center text-sm text-muted-foreground">
                    No employees match these filters.
                  </TableCell>
                </TableRow>
              )}
              {!error &&
                pagination.pageItems.map((e) => (
                  <EmployeeRow
                    key={e.dbId}
                    e={e}
                    selected={selected.has(e.dbId)}
                    onSelect={toggleOne}
                    onView={setViewing}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                  />
                ))}
            </TableBody>
          </Table>
          {!error && pagination.total > 0 && (
            <div className="border-t border-border px-4 py-3">
              <DataTablePagination {...pagination} />
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDetailSheet employee={viewing} onClose={() => setViewing(null)} />

      <Dialog open={reassignOpen} onOpenChange={(open) => !busy && setReassignOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign {chosen.length} employee{chosen.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Choose the new department. The role is optional; leave it empty to keep each person&apos;s current role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={reassignDept} onValueChange={setReassignDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New role (optional)</Label>
              <Input
                value={reassignRole}
                onChange={(e) => setReassignRole(e.target.value)}
                placeholder="e.g. Site Engineer"
              />
            </div>
            {archivedChosen > 0 && (
              <p className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
                {archivedChosen} archived employee{archivedChosen === 1 ? "" : "s"} will be set back to Active so the
                record&apos;s status matches the new assignment.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handleReassign()} disabled={!reassignDept || busy}>
              {busy ? "Reassigning…" : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        loading={busy}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          void action?.run();
        }}
      />
    </div>
  );
}
