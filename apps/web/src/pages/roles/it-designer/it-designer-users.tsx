import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserCheck, UserX, UsersRound } from "lucide-react";
import { useSearchParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserAccountDialog } from "@/components/users/user-account-dialog";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useRoles } from "@/features/roles/hooks/useRoles";
import { useUsersPaged } from "@/features/users/hooks/use-users-paged";
import { StaffingGapsCard } from "@/features/project-members/components/StaffingGapsCard";
import type { PublicUser } from "@/features/users/repositories/user.repository";

export default function ITDesignerUsersPage() {
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const { list, create, update, setPassword, setActive, remove } = useUsersPaged(roleFilter);
  const { roles } = useRoles();
  const { loading, error: loadError, searchInput: search, setSearchInput: setSearch } = list;
  const error = loadError;
  const users = list.pageItems;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Deletion is permanent and only offered once an account is deactivated,
  // so it is always a second, deliberate step after access has been revoked.
  const [deleting, setDeleting] = useState<PublicUser | null>(null);
  const [removing, setRemoving] = useState(false);

  // The header's global "New User" button is a plain <Link> (see header.tsx)
  // — it can only navigate, not call a function on this page. It lands here
  // with ?new=1, which this effect reads once to open the create dialog, then
  // strips so the param doesn't linger in the URL or reopen the dialog on a
  // back/forward navigation.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditing(null);
    setDialogOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("new");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const roleLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roles) map.set(role.name, role.label);
    return map;
  }, [roles]);

  const pagination = list;
  const filtered = users;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (user: PublicUser) => {
    setEditing(user);
    setDialogOpen(true);
  };

  const toggleActive = async (user: PublicUser) => {
    setStatusError(null);
    try {
      await setActive(user.id, !user.isActive);
    } catch (err) {
      // Most likely the server refusing a self-deactivation.
      setStatusError(err instanceof Error ? err.message : "Couldn't update the account");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    setStatusError(null);
    try {
      await remove(deleting.id);
      setDeleting(null);
    } catch (err) {
      // Surfaces the API's reason: still referenced, still active, or self.
      setStatusError(err instanceof Error ? err.message : "Couldn't delete the account");
      setDeleting(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="User accounts"
        description="Create sign-ins, move people between roles, and deactivate access without erasing history."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New account
          </Button>
        }
      />
      <PageContent className="p-6 md:p-8">
        <div className="mb-4">
          <StaffingGapsCard />
        </div>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={`cursor-pointer rounded-full text-overline ${roleFilter === null ? "border-primary text-primary-strong" : ""}`}
              onClick={() => setRoleFilter(null)}
            >
              All{roleFilter === null ? ` (${list.total})` : ""}
            </Badge>
            {roles.map((role) => (
              <Badge
                key={role.id}
                variant="outline"
                className={`cursor-pointer rounded-full text-overline ${roleFilter === role.name ? "border-primary text-primary-strong" : ""}`}
                onClick={() => setRoleFilter(roleFilter === role.name ? null : role.name)}
              >
                {role.label}
              </Badge>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-border bg-muted/40 pl-9"
            />
          </div>
        </div>

        {statusError && (
          <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
            {statusError}
          </p>
        )}

        {loading && <p className="p-5 text-sm text-muted-foreground">Loading accounts…</p>}
        {!loading && error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
            Couldn't load accounts. {error.message}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
            <UsersRound className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {!list.search && !roleFilter ? "No accounts yet." : "No accounts match your filters."}
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-overline uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-3.5 font-medium">{user.name}</td>
                    <td className="px-3 py-3.5 text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-3.5">
                      <Badge variant="outline" className="rounded-full text-overline">
                        {roleLabels.get(user.role) ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-3.5">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-success-strong">
                          <UserCheck className="h-3.5 w-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserX className="h-3.5 w-3.5" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                         
                          onClick={() => openEdit(user)}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit {user.name}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => void toggleActive(user)}
                        >
                          {user.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                        {/* Only offered for accounts that are already
                            deactivated — the API enforces the same rule. */}
                        {!user.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive-strong hover:text-destructive-strong"
                            title={`Permanently delete ${user.name}`}
                            onClick={() => setDeleting(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete {user.name}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-3 py-2.5">
              <DataTablePagination {...pagination} />
            </div>
          </div>
        )}
      </PageContent>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Permanently delete ${deleting?.name ?? "this account"}?`}
        description="The sign-in and its details are removed for good. The audit trail of what this person did is kept. If the account still has an employee record, project assignment, or an assigned task, the delete is refused and the account stays deactivated."
        confirmLabel="Delete account"
        destructive
        loading={removing}
        onConfirm={() => void confirmDelete()}
      />

      <UserAccountDialog
        open={dialogOpen}
        user={editing}
        roles={roles}
        onOpenChange={setDialogOpen}
        onCreate={create}
        onUpdate={update}
        onSetPassword={setPassword}
      />
    </PageContainer>
  );
}

ITDesignerUsersPage.displayName = "ITDesignerUsersPage";
