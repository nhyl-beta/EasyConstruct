import { useCallback, useMemo, useState } from "react";
import { Info, LayoutGrid, Network, Search } from "lucide-react";

import { SplitDetailLayout } from "@/components/detail-panel/DetailPanel";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RoleHierarchyCanvas } from "@/features/roles/components/RoleHierarchyCanvas";
import { RoleMatrix, modulesFor } from "@/features/roles/components/RoleMatrix";
import type { RoleCardData } from "@/features/roles/components/RoleNodeCard";
import { RoleSidePanel } from "@/features/roles/components/RoleSidePanel";
import { useRoleAccounts } from "@/features/roles/hooks/useRoleAccounts";
import { useRoles } from "@/features/roles/hooks/useRoles";
import { GROUPS, ROLE_FALLBACK_LABEL, ROLE_HIERARCHY, nodeOf } from "@/features/roles/role-hierarchy";
import { useSelectedParam } from "@/hooks/use-selected-param";

type View = "hierarchy" | "matrix";

const DISPLAY_NOTE = "The hierarchy is for display only. It does not give a role the permissions of the roles below it.";

/**
 * Roles & Permissions for Admin and IT Designer: an org chart of the ten roles
 * (default) or a roles x pages matrix. View only: permissions are enforced by
 * per-route guards, not by an editable table, so nothing here can change them.
 */
export default function AdminRolesPermissionsPage() {
  const { roles, loading, error } = useRoles();
  const accounts = useRoleAccounts();
  const [view, setView] = useState<View>("hierarchy");
  const [query, setQuery] = useState("");
  const [panelTab, setPanelTab] = useState<string | undefined>(undefined);
  const [selected, select] = useSelectedParam();

  const roleByName = useMemo(() => new Map(roles.map((r) => [r.name, r])), [roles]);
  const labelOf = useCallback((key: string) => roleByName.get(key)?.label ?? ROLE_FALLBACK_LABEL[key] ?? key, [roleByName]);
  const countsReady = !accounts.loading && !accounts.error;

  const cardOf = useCallback(
    (role: string): RoleCardData => {
      const entry = accounts.summary[role];
      const active = entry?.users.filter((u) => u.isActive) ?? [];
      return {
        role,
        label: labelOf(role),
        accessLevel: nodeOf(role)?.accessLevel ?? "operational",
        userNames: active.map((u) => u.name),
        userCount: countsReady ? (entry?.activeUsers ?? 0) : null,
        pageCount: modulesFor(role).length,
      };
    },
    [accounts.summary, countsReady, labelOf],
  );

  const totalUsers = countsReady ? Object.values(accounts.summary).reduce((n, r) => n + r.activeUsers, 0) : null;

  const known = selected && ROLE_HIERARCHY.some((n) => n.role === selected) ? selected : null;
  const node = nodeOf(known ?? "");
  const open = useCallback(
    (role: string, tab?: string) => {
      setPanelTab(tab);
      select(role);
    },
    [select],
  );
  const close = useCallback(() => select(null), [select]);
  const step = useCallback(
    (delta: 1 | -1) => {
      const keys = ROLE_HIERARCHY.map((n) => n.role);
      const at = keys.indexOf(known ?? "");
      const next = keys[Math.min(keys.length - 1, Math.max(0, at + delta))];
      if (next) open(next);
    },
    [known, open],
  );

  const parentKey = node?.parent && !node.parent.startsWith("group:") ? node.parent : null;

  return (
    <PageContainer>
      <PageHeader
        title="Roles & permissions"
        description="The roles configured across EasyConstruct and what they can open."
        status={
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={DISPLAY_NOTE}>
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{DISPLAY_NOTE}</TooltipContent>
          </Tooltip>
        }
      />
      <PageContent className="space-y-4 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums" aria-label="Summary">
            <li>
              <span className="font-medium text-foreground">{ROLE_HIERARCHY.length}</span> roles
            </li>
            <li aria-hidden>·</li>
            <li>
              <span className="font-medium text-foreground">{totalUsers ?? "—"}</span> active users
            </li>
            <li aria-hidden>·</li>
            <li>
              <span className="font-medium text-foreground">{GROUPS.length - 1}</span> departments
            </li>
            <li aria-hidden>·</li>
            <li>No permission changes recorded</li>
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role…" className="h-8 pl-8 text-xs" aria-label="Find a role" />
            </div>
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList className="h-8">
                <TabsTrigger value="hierarchy" className="gap-1.5 text-xs">
                  <Network className="h-3.5 w-3.5" /> Hierarchy
                </TabsTrigger>
                <TabsTrigger value="matrix" className="gap-1.5 text-xs">
                  <LayoutGrid className="h-3.5 w-3.5" /> Matrix
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading roles…</p>}
        {!loading && error && <p className="text-sm text-destructive-strong">Couldn't load roles. {error.message}</p>}
        {accounts.error && <p className="text-xs text-muted-foreground">User counts are unavailable: {accounts.error}</p>}

        <SplitDetailLayout
          open={!!known}
          onClose={close}
          onStep={step}
          sheetLabel="Role details"
          panel={({ inSheet }) =>
            known && (
              <RoleSidePanel
                key={`${known}:${panelTab ?? ""}`}
                roleKey={known}
                role={roleByName.get(known)}
                label={labelOf(known)}
                accounts={accounts.summary[known]}
                parentLabel={parentKey ? labelOf(parentKey) : node?.parent ? "Governance pair" : null}
                group={node?.group ?? null}
                onClose={close}
                inSheet={inSheet}
                readOnly
                defaultTab={panelTab}
              />
            )
          }
        >
          {view === "hierarchy" ? (
            <RoleHierarchyCanvas
              ctx={{
                cardOf,
                selected: known,
                query,
                onOpen: (r) => open(r),
                onViewUsers: (r) => open(r, "users"),
              }}
            />
          ) : (
            <RoleMatrix labelOf={labelOf} onView={(r) => open(r)} selected={known} query={query} />
          )}
        </SplitDetailLayout>
      </PageContent>
    </PageContainer>
  );
}

AdminRolesPermissionsPage.displayName = "AdminRolesPermissionsPage";
