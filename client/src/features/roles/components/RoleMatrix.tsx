import { Check, Minus } from "lucide-react";

import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { toFrontendRole } from "@/config/role-mapping";
import { resources } from "@/providers/resources";
import { ROLE_HIERARCHY } from "../role-hierarchy";

/** Label and sidebar group of a module (a Refine resource), falling back to its key. */
export const moduleInfo = (name: string): { label: string; group: string } => {
  const r = resources.find((x) => x.name === name);
  const meta = (r?.meta ?? {}) as { label?: string; group?: string };
  return { label: meta.label ?? name, group: meta.group ?? "Other" };
};

/** The modules (pages) a role can open, from the same map the client route guards read. */
export const modulesFor = (role: string): string[] => ROLE_RESOURCE_ACCESS[toFrontendRole(role)] ?? [];

/** Roles x modules: which role can open which page, for side-by-side comparison. */
export function RoleMatrix({ labelOf, onView }: { labelOf: (role: string) => string; onView: (role: string) => void }) {
  const roleKeys = ROLE_HIERARCHY.map((n) => n.role);
  const modules = [...new Set(roleKeys.flatMap(modulesFor))].map((name) => ({ name, ...moduleInfo(name) }));
  modules.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

  return (
    <div className="overflow-auto rounded-2xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left font-medium">Module</th>
            {roleKeys.map((r) => (
              <th key={r} className="px-2 py-2 text-center text-xs font-medium">
                <button type="button" className="hover:underline" onClick={() => onView(r)}>
                  {labelOf(r)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.name} className="border-b border-border/60 last:border-0">
              <td className="sticky left-0 bg-card px-3 py-1.5">
                <span className="block">{m.label}</span>
                <span className="block text-overline text-muted-foreground">{m.group}</span>
              </td>
              {roleKeys.map((r) => (
                <td key={r} className="px-2 py-1.5 text-center">
                  {modulesFor(r).includes(m.name) ? (
                    <Check className="mx-auto h-4 w-4 text-success-strong" aria-label="Can open" />
                  ) : (
                    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="No access" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
