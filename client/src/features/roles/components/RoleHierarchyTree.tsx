import { useState, type ReactNode } from "react";
import { ChevronDown, Eye, Minus, Pencil, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  ROLE_ICON,
  childrenOf,
  flattenHierarchy,
  groupParentKey,
  type RoleHierarchyNode,
} from "../role-hierarchy";

export interface RoleTreeContext {
  labelOf: (role: string) => string;
  userCountOf: (role: string) => number | null;
  selected: string | null;
  onView: (role: string) => void;
  /** Edit is only offered when the viewer can manage roles. */
  onEdit?: (role: string) => void;
}

/** Group chips alternate between tinted primary and secondary sand. */
const CHIP_TONES = ["bg-primary-soft text-primary-strong", "bg-secondary text-secondary-foreground"];
const chipTone = (label: string, labels: string[]) => CHIP_TONES[Math.max(0, labels.indexOf(label)) % CHIP_TONES.length];

const countText = (n: number | null) => (n === null ? "—" : `${n} ${n === 1 ? "user" : "users"}`);

function RoleCard({ role, ctx }: { role: string; ctx: RoleTreeContext }) {
  const Icon = ROLE_ICON[role] ?? ROLE_ICON.admin!;
  const isSelected = ctx.selected === role;
  return (
    <div
      data-role={role}
      className={cn(
        "relative mt-6 w-44 rounded-xl border bg-card pt-7 text-center shadow-sm",
        isSelected ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      <span className="absolute -top-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background bg-primary-soft text-primary-strong shadow-sm">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="px-3 pb-3">
        <p className="text-sm font-semibold leading-tight">{ctx.labelOf(role)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{countText(ctx.userCountOf(role))}</p>
      </div>
      <div className="flex items-center justify-center gap-1 border-t border-border py-1.5">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => ctx.onView(role)} aria-label={`View ${ctx.labelOf(role)}`}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
        {ctx.onEdit && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => ctx.onEdit?.(role)} aria-label={`Edit ${ctx.labelOf(role)}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Chip({ label, tone, className }: { label: string; tone: string; className?: string }) {
  return <span className={cn("z-10 whitespace-nowrap rounded-full px-2.5 py-0.5 text-overline font-medium shadow-sm", tone, className)}>{label}</span>;
}

/** The children of a role, or of a bracket (`group:<label>`): one connected row, with its bracket chip(s). */
function Children({ parent, ctx, labels }: { parent: string; ctx: RoleTreeContext; labels: string[] }): ReactNode {
  const groups = childrenOf(parent);
  if (groups.length === 0) return null;
  const items = groups.flatMap((g) => g.nodes.map((node) => ({ node, chip: g.group })));
  // One shared bracket (Admin + IT Designer) gets a single chip in the middle of the line;
  // several brackets in one row (the departments) each carry their own chip.
  const sharedChip = groups.length === 1 ? groups[0]!.group : null;
  const bracketLabels = [...new Set(items.map((i) => i.chip).filter((c): c is string => !!c))];

  return (
    <div className="flex flex-col items-center">
      <span className="h-4 w-px bg-border" aria-hidden />
      <div className="relative flex items-start">
        {sharedChip && items.length > 1 && (
          <Chip label={sharedChip} tone={chipTone(sharedChip, labels)} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" />
        )}
        {items.map(({ node, chip }, i) => (
          <div key={node.role} className="relative flex flex-col items-center px-4 pt-5">
            {items.length > 1 && (
              <span
                aria-hidden
                className={cn("absolute top-0 h-px bg-border", i === 0 ? "left-1/2 right-0" : i === items.length - 1 ? "left-0 right-1/2" : "left-0 right-0")}
              />
            )}
            <span aria-hidden className="absolute left-1/2 top-0 h-5 w-px bg-border" />
            <ChevronDown aria-hidden className="absolute left-1/2 top-[11px] h-3 w-3 -translate-x-1/2 text-muted-foreground" />
            {!sharedChip && chip && <Chip label={chip} tone={chipTone(chip, bracketLabels)} className="absolute left-1/2 top-0.5 -translate-x-1/2 translate-y-[3px]" />}
            <Subtree node={node} ctx={ctx} labels={labels} />
          </div>
        ))}
      </div>
      {/* Whatever hangs from the middle of a bracket sits under the whole row. */}
      {sharedChip && <Children parent={groupParentKey(sharedChip)} ctx={ctx} labels={labels} />}
    </div>
  );
}

function Subtree({ node, ctx, labels }: { node: RoleHierarchyNode; ctx: RoleTreeContext; labels: string[] }) {
  return (
    <div className="flex flex-col items-center">
      <RoleCard role={node.role} ctx={ctx} />
      <Children parent={node.role} ctx={ctx} labels={labels} />
    </div>
  );
}

function IndentedList({ ctx }: { ctx: RoleTreeContext }) {
  const rows = flattenHierarchy();
  return (
    <ul className="space-y-1.5">
      {rows.map(({ node, depth, group }, i) => {
        const Icon = ROLE_ICON[node.role] ?? ROLE_ICON.admin!;
        const newGroup = group && rows[i - 1]?.group !== group;
        return (
          <li key={node.role} style={{ paddingLeft: depth * 16 }}>
            {newGroup && <p className="mb-1 mt-2 text-overline font-medium uppercase tracking-wide text-muted-foreground">{group}</p>}
            <button
              type="button"
              onClick={() => ctx.onView(node.role)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left",
                ctx.selected === node.role ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{ctx.labelOf(node.role)}</span>
                <span className="block text-xs text-muted-foreground">{countText(ctx.userCountOf(node.role))}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Top-down org chart of the roles. Under 768px it collapses to an indented list. */
export function RoleHierarchyTree({ ctx }: { ctx: RoleTreeContext }) {
  const wide = useMediaQuery("(min-width: 768px)");
  const [zoom, setZoom] = useState(1);
  const labels = ["System governance", "Project delivery", "People", "Finance"];
  const root = flattenHierarchy()[0]?.node;

  if (!wide) return <IndentedList ctx={ctx} />;
  if (!root) return null;

  const clamp = (z: number) => Math.min(1.5, Math.max(0.5, Math.round(z * 100) / 100));
  return (
    <div className="relative rounded-2xl border border-border bg-muted/30">
      <div
        className="overflow-auto rounded-2xl p-6"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          minHeight: 520,
        }}
      >
        <div className="mx-auto w-max origin-top transition-transform" style={{ transform: `scale(${zoom})` }}>
          <Subtree node={root} ctx={ctx} labels={labels} />
        </div>
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z + 0.1))} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z - 0.1))} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} aria-label="Reset zoom">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
