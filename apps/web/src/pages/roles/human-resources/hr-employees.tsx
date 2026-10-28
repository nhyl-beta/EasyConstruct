import { useIsReadOnlyAdmin } from "@/hooks/use-read-only-admin";
import { Download, Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "@/features/hr/hr-api";
import type { Employee } from "@/features/hr/types";
import { downloadCsv } from "@/lib/export-csv";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useServerList } from "@/hooks/use-server-list";
import { SavedFiltersBar } from "@/components/shared/SavedFiltersBar";
import { qk } from "@/lib/query-keys";
import { useWorkforceSnapshot } from "@/features/workforce/hooks/useWorkforceSnapshot";

function EmployeeRow({
  e,
  onArchive,
  onDelete,
}: {
  e: Employee;
  onArchive: (e: Employee) => void;
  onDelete: (e: Employee) => void;
}) {
  const readOnly = useIsReadOnlyAdmin();
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
            {!readOnly && (
              <DropdownMenuItem asChild>
                <Link to={`/employees/${e.dbId}/edit`}>Edit record</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>Employment history</DropdownMenuItem>
            <DropdownMenuItem>Documents</DropdownMenuItem>
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
  };

  const handleDelete = async (e: Employee) => {
    if (!window.confirm(`Delete ${e.name}? This cannot be undone.`)) return;
    await deleteEmployee(e.dbId);
  };

  const handleExportCsv = async () => {
    // Export covers everything the filters select, not just the page on screen.
    const rows = await listEmployeesAll({ search: pagination.search, department: dept, status });
    downloadCsv(
      "employees",
      ["Employee ID", "Name", "Role", "Department", "Site", "Status", "Hired On", "Email", "Phone"],
      rows.map((e) => [
        e.id,
        e.name,
        e.role,
        e.department,
        e.site,
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
          <SavedFiltersBar
            page="hr-employees"
            current={{ search: query, dept, status }}
            hasActive={query.trim() !== "" || dept !== "all" || status !== "all"}
            onApply={(f: { search: string; dept: string; status: string }) => {
              setQuery(f.search);
              setDept(f.dept);
              setStatus(f.status);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Employee directory</CardTitle>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${pagination.total} of ${workforce.totalEmployees} employees`}
              {" "}· bulk actions available
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
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-destructive-strong">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && !loading && pagination.total === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    No employees match these filters.
                  </TableCell>
                </TableRow>
              )}
              {!error &&
                pagination.pageItems.map((e) => (
                  <EmployeeRow
                    key={e.dbId}
                    e={e}
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
    </div>
  );
}
