import { useCallback, useMemo, useState } from "react";
import { Info, LayoutGrid, Network } from "lucide-react";

import { SplitDetailLayout } from "@/components/detail-panel/DetailPanel";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { RoleHierarchyTree } from "@/features/roles/components/RoleHierarchyTree";
import { RoleMatrix } from "@/features/roles/components/RoleMatrix";
import { RoleSidePanel } from "@/features/roles/components/RoleSidePanel";
import { useRoleAccounts } from "@/features/roles/hooks/useRoleAccounts";
import { useRoles } from "@/features/roles/hooks/useRoles";
import { ROLE_FALLBACK_LABEL, ROLE_HIERARCHY } from "@/features/roles/role-hierarchy";
import { useSelectedParam } from "@/hooks/use-selected-param";

type View = "hierarchy" | "matrix";

/**
 * Roles & Permissions for Admin and IT Designer: an org-chart of the ten roles
 * (default) or a roles x pages matrix. View only: permissions are enforced by
 * per-route guards, not by an editable table, so nothing here can change them.
 */
export default function AdminRolesPermissionsPage() {
  const { roles, loading, error } = useRoles();
  const accounts = useRoleAccounts();
  const [view, setView] = useState<View>("hierarchy");
  const [selected, select] = useSelectedParam();

  const roleByName = useMemo(() => new Map(roles.map((r) => [r.name, r])), [roles]);
  const labelOf = useCallback((key: string) => roleByName.get(key)?.label ?? ROLE_FALLBACK_LABEL[key] ?? key, [roleByName]);
  const userCountOf = useCallback((key: string) => (accounts.loading || accounts.error ? null : (accounts.summary[key]?.activeUsers ?? 0)), [accounts]);

  const known = selected && ROLE_HIERARCHY.some((n) => n.role === selected) ? selected : null;
  const node = ROLE_HIERARCHY.find((n) => n.role === known);
  const close = useCallback(() => select(null), [select]);
  const step = useCallback(
    (delta: 1 | -1) => {
      const keys = ROLE_HIERARCHY.map((n) => n.role);
      const at = keys.indexOf(known ?? "");
      const next = keys[Math.min(keys.length - 1, Math.max(0, at + delta))];
      if (next) select(next);
    },
    [known, select],
  );

  const parentKey = node?.parent && !node.parent.startsWith("group:") ? node.parent : null;

  return (
    <PageContainer>
      <PageHeader title="Roles & permissions" description="The roles configured across EasyConstruct and what they can open." />
      <PageContent className="space-y-4 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>The hierarchy is for display only. It does not give a role the permissions of the roles below it.</span>
          </p>
          <div role="group" aria-label="View" className="inline-flex rounded-xl border border-border p-0.5">
            <Button type="button" size="sm" variant={view === "hierarchy" ? "default" : "ghost"} aria-pressed={view === "hierarchy"} onClick={() => setView("hierarchy")}>
              <Network className="h-4 w-4" /> Hierarchy
            </Button>
            <Button type="button" size="sm" variant={view === "matrix" ? "default" : "ghost"} aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>
              <LayoutGrid className="h-4 w-4" /> Matrix
            </Button>
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
                roleKey={known}
                role={roleByName.get(known)}
                label={labelOf(known)}
                accounts={accounts.summary[known]}
                parentLabel={parentKey ? labelOf(parentKey) : node?.parent ? "Governance bracket" : null}
                group={node?.group ?? null}
                onClose={close}
                inSheet={inSheet}
                readOnly
              />
            )
          }
        >
          {view === "hierarchy" ? (
            <RoleHierarchyTree ctx={{ labelOf, userCountOf, selected: known, onView: select }} />
          ) : (
            <RoleMatrix labelOf={labelOf} onView={select} />
          )}
        </SplitDetailLayout>
      </PageContent>
    </PageContainer>
  );
}

AdminRolesPermissionsPage.displayName = "AdminRolesPermissionsPage";
