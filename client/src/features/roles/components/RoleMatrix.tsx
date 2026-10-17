import { Check, Minus } from "lucide-react";

import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { toFrontendRole } from "@/config/role-mapping";
import { resources } from "@/providers/resources";
import { cn } from "@/lib/utils";
import { ROLE_HIERARCHY, nodeOf } from "../role-hierarchy";
import { AccessBadge, RoleIconTile } from "./RoleNodeCard";

/** Label and sidebar group of a module (a Refine resource), falling back to its key. */
export const moduleInfo = (name: string): { label: string; group: string } => {
  const r = resources.find((x) => x.name === name);
  const meta = (r?.meta ?? {}) as { label?: string; group?: string };
  return { label: meta.label ?? name, group: meta.group ?? "Other" };
};

/** The modules (pages) a role can open, from the same map the client route guards read. */
export const modulesFor = (role: string): string[] => ROLE_RESOURCE_ACCESS[toFrontendRole(role)] ?? [];

interface RoleMatrixProps {
  labelOf: (role: string) => string;
  onView: (role: string) => void;
  selected: string | null;
  /** Typed search text: non-matching roles are dimmed. */
  query: string;
}

/**
 * Roles (rows) x pages (columns, grouped by sidebar section). Both the role
 * column and the header rows are sticky. View only: access comes from the
 * client route map, which nothing here can change.
 */
export function RoleMatrix({ labelOf, onView, selected, query }: RoleMatrixProps) {
  const roleKeys = ROLE_HIERARCHY.map((n) => n.role);
  const modules = [...new Set(roleKeys.flatMap(modulesFor))].map((name) => ({ name, ...moduleInfo(name) }));
  modules.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const groups = [...new Set(modules.map((m) => m.group))].map((g) => ({ label: g, span: modules.filter((m) => m.group === g).length }));
  const needle = query.trim().toLowerCase();

  return (
    <div className="max-h-[78vh] overflow-auto rounded-xl border border-border bg-card">
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-56 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium">
              Role
            </th>
            {groups.map((g) => (
              <th
                key={g.label}
                colSpan={g.span}
                className="sticky top-0 z-20 border-b border-l border-border bg-muted px-2 py-1.5 text-left text-overline font-medium uppercase tracking-wide text-muted-foreground"
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            {modules.map((m, i) => (
              <th
                key={m.name}
                className={cn(
                  "sticky top-[29px] z-20 h-32 w-8 min-w-8 border-b border-border bg-muted px-0 pb-2 align-bottom text-[11px] font-normal text-muted-foreground",
                  i === 0 || modules[i - 1]!.group !== m.group ? "border-l" : "",
                )}
              >
                <span className="mx-auto block [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{m.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roleKeys.map((r) => {
            const label = labelOf(r);
            const dimmed = needle !== "" && !label.toLowerCase().includes(needle) && !r.includes(needle);
            const allowed = new Set(modulesFor(r));
            return (
              <tr key={r} className={cn("transition-opacity duration-150 motion-reduce:transition-none", dimmed && "opacity-30")}>
                <th scope="row" className={cn("sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-normal", selected === r && "bg-primary-soft/50")}>
                  <button type="button" className="flex w-full items-center gap-2.5 text-left" onClick={() => onView(r)}>
                    <RoleIconTile role={r} className="h-8 w-8 [&>svg]:h-4 [&>svg]:w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{label}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{r}</span>
                    </span>
                    <AccessBadge level={nodeOf(r)?.accessLevel ?? "operational"} />
                  </button>
                </th>
                {modules.map((m, i) => (
                  <td
                    key={m.name}
                    className={cn(
                      "border-b border-border/60 px-0 py-1.5 text-center",
                      i === 0 || modules[i - 1]!.group !== m.group ? "border-l border-l-border" : "",
                      selected === r && "bg-primary-soft/30",
                    )}
                  >
                    {allowed.has(m.name) ? (
                      <Check className="mx-auto h-3.5 w-3.5 text-success-strong" aria-label={`${label} can open ${m.label}`} />
                    ) : (
                      <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/30" aria-label={`${label} cannot open ${m.label}`} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
