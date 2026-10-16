import type { ReactNode } from "react";
import { Check, Info } from "lucide-react";

import { DetailPanel } from "@/components/detail-panel/DetailPanel";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { Badge } from "@/components/ui/badge";
import type { RoleAccountSummary } from "../repositories/role.repository";
import type { Role } from "../types/role.types";
import { ROLE_HIERARCHY } from "../role-hierarchy";
import { modulesFor, moduleInfo } from "./RoleMatrix";

interface RoleSidePanelProps {
  roleKey: string;
  role: Role | undefined;
  label: string;
  accounts: RoleAccountSummary | undefined;
  parentLabel: string | null;
  group: string | null;
  onClose: () => void;
  inSheet?: boolean;
  /** Everyone is view-only today: see the note on the Permissions tab. */
  readOnly: boolean;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RoleUsersList({ users }: { users: RoleAccountSummary["users"] }) {
  const pg = usePagination(users, 8);
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border/60 rounded-xl border border-border bg-background">
        {pg.pageItems.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{u.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
            </span>
            {!u.isActive && <Badge variant="outline">Inactive</Badge>}
          </li>
        ))}
      </ul>
      <DataTablePagination {...pg} />
    </div>
  );
}

export function RoleSidePanel({ roleKey, role, label, accounts, parentLabel, group, onClose, inSheet, readOnly }: RoleSidePanelProps) {
  const children = ROLE_HIERARCHY.filter((n) => n.parent === roleKey).map((n) => n.role);
  const modules = modulesFor(roleKey).map((name) => ({ name, ...moduleInfo(name) }));
  const byGroup = new Map<string, typeof modules>();
  for (const m of modules) byGroup.set(m.group, [...(byGroup.get(m.group) ?? []), m]);
  const count = accounts?.activeUsers ?? 0;

  return (
    <DetailPanel
      title={label}
      subtitle={`${roleKey} · ${count} ${count === 1 ? "user" : "users"}`}
      badge={readOnly ? <Badge variant="outline">View only</Badge> : undefined}
      onClose={onClose}
      hideCloseButton={inSheet}
      tabs={[
        {
          value: "overview",
          label: "Overview",
          content: (
            <>
              <Card title="Description">
                <p className="text-sm text-muted-foreground">{role?.description ?? "No description on file."}</p>
              </Card>
              <Card title="Place in the hierarchy">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Reports to</dt>
                    <dd>{parentLabel ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Group</dt>
                    <dd>{group ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Direct reports</dt>
                    <dd className="text-right">{children.length ? children.join(", ") : "—"}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">Display only. The hierarchy does not give a role the permissions of the roles below it.</p>
              </Card>
            </>
          ),
        },
        {
          value: "permissions",
          label: "Permissions",
          content: (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Page access, as enforced by the client route guards. What a role may do inside a page (create, edit, approve, delete) is enforced per
                  endpoint on the server and is not editable from here yet.
                </p>
              </div>
              {byGroup.size === 0 && <p className="text-sm text-muted-foreground">No pages are mapped to this role.</p>}
              {[...byGroup.entries()].map(([g, items]) => (
                <Card key={g} title={g}>
                  <ul className="space-y-1">
                    {items.map((m) => (
                      <li key={m.name} className="flex items-center justify-between gap-2 text-sm">
                        <span>{m.label}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-success-strong">
                          <Check className="h-3.5 w-3.5" aria-hidden /> View
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </>
          ),
        },
        {
          value: "users",
          label: "Users",
          content:
            !accounts || accounts.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts hold this role.</p>
            ) : (
              <RoleUsersList users={accounts.users} />
            ),
        },
        {
          value: "history",
          label: "History",
          content: (
            <p className="text-sm text-muted-foreground">
              No permission changes are recorded. Permissions are defined in code today, so there is nothing to audit here; account changes appear in
              Activity Logs.
            </p>
          ),
        },
      ]}
    />
  );
}
