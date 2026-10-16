import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { ACCESS_LEVELS, TIER_LABELS, flattenHierarchy, type AccessLevel } from "../role-hierarchy";
import { CARD_H, CARD_W, GAP_Y, RAIL_W, computeRoleLayout, neighbour } from "../role-layout";
import { AccessBadge, RoleNodeCard, type RoleCardData } from "./RoleNodeCard";

export interface RoleCanvasContext {
  cardOf: (role: string) => RoleCardData;
  selected: string | null;
  /** Typed search text: matches are highlighted, the rest dimmed. */
  query: string;
  onOpen: (role: string) => void;
  onViewUsers: (role: string) => void;
  /** Present only when the viewer can manage roles. */
  onEdit?: (role: string) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

const matches = (card: RoleCardData, q: string) => {
  const needle = q.trim().toLowerCase();
  return needle !== "" && (card.label.toLowerCase().includes(needle) || card.role.toLowerCase().includes(needle));
};

/** One-line legend of the four access levels. */
function Legend() {
  return (
    <div className="flex flex-col justify-center gap-1 border-t border-border bg-card px-3 py-2 text-[11px]">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <AccessBadge level={l} />
            <span className="text-muted-foreground">{ACCESS_LEVELS[l].meaning}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">Lines show reporting structure, not inherited permissions.</p>
    </div>
  );
}

function CompactList({ ctx }: { ctx: RoleCanvasContext }) {
  const rows = flattenHierarchy();
  return (
    <div className="space-y-1.5">
      {TIER_LABELS.map((label, tier) => {
        const inTier = rows.filter((r) => r.node.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <section key={label} aria-label={label} className="space-y-1.5">
            <h3 className="pt-2 text-overline font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
            {inTier.map(({ node, depth }) => {
              const card = ctx.cardOf(node.role);
              return (
                <div key={node.role} className={cn("border-l border-border pl-3", depth === 0 && "border-l-0 pl-0")} style={{ marginLeft: Math.min(depth, 3) * 8 }}>
                  <RoleNodeCard
                    compact
                    data={card}
                    selected={ctx.selected === node.role}
                    dimmed={ctx.query.trim() !== "" && !matches(card, ctx.query)}
                    matched={matches(card, ctx.query)}
                    onOpen={() => ctx.onOpen(node.role)}
                    onViewUsers={() => ctx.onViewUsers(node.role)}
                    onEdit={ctx.onEdit && (() => ctx.onEdit?.(node.role))}
                  />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The org chart: cards placed by d3-hierarchy, connectors in one SVG layer
 * behind them, tier bands and group containers, pan and zoom. Under 768px it
 * becomes a grouped, indented list instead.
 */
export function RoleHierarchyCanvas({ ctx }: { ctx: RoleCanvasContext }) {
  const wide = useMediaQuery("(min-width: 768px)");
  const layout = useMemo(() => computeRoleLayout(), []);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  // Until the user pans or zooms, the chart keeps itself framed as the canvas is resized.
  const adjusted = useRef(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [focusRole, setFocusRole] = useState("owner");

  const selectedNode = ctx.selected ? layout.nodes[ctx.selected] : undefined;
  const fit = useCallback(
    (width = size.w) => {
      if (width <= 0) return;
      const z = Math.min(1, clampZoom(width / layout.width));
      let tx = (width - layout.width * z) / 2;
      // Too wide even at the smallest zoom (panel open): keep the selected card in the middle.
      if (layout.width * z > width && selectedNode) {
        tx = Math.min(0, Math.max(width - layout.width * z, width / 2 - selectedNode.cx * z));
      }
      setView({ z, tx, ty: 0 });
    },
    [size.w, layout.width, selectedNode],
  );

  // Track the viewport; frame the tree on first load.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || !wide) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide]);

  useEffect(() => {
    if (!adjusted.current && size.w > 0) fit(size.w);
  }, [size.w, fit]);

  const zoomTo = useCallback(
    (nextZ: number, anchor?: { x: number; y: number }) => {
      adjusted.current = true;
      setView((v) => {
        const z = clampZoom(nextZ);
        const ax = anchor?.x ?? size.w / 2;
        const ay = anchor?.y ?? 0;
        // Keep the point under the anchor still while the scale changes.
        const wx = (ax - v.tx) / v.z;
        const wy = (ay - v.ty) / v.z;
        return { z, tx: ax - wx * z, ty: ay - wy * z };
      });
    },
    [size.w],
  );

  // ctrl / cmd + wheel zooms around the pointer; a plain wheel scrolls the page as usual.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !wide) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(view.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wide, view.z, zoomTo]);

  // Typing in the search box pans the first match into view.
  const firstMatch = useMemo(() => Object.keys(layout.nodes).find((r) => matches(ctx.cardOf(r), ctx.query)), [layout.nodes, ctx]);
  useEffect(() => {
    if (!firstMatch || size.w === 0) return;
    adjusted.current = true;
    const n = layout.nodes[firstMatch]!;
    setView((v) => ({ ...v, tx: size.w / 2 - n.cx * v.z }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMatch]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[role=treeitem],button,[data-no-pan]")) return;
    adjusted.current = true;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const onItemKey = (e: KeyboardEvent<HTMLDivElement>, role: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ctx.onOpen(role);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const next = neighbour(layout, role, e.key as "ArrowUp");
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setFocusRole(next);
    requestAnimationFrame(() => viewportRef.current?.querySelector<HTMLElement>(`[data-role-item="${next}"]`)?.focus());
  };

  if (!wide) return <CompactList ctx={ctx} />;

  const onPath = new Set(ctx.selected ? layout.pathTo(ctx.selected) : []);
  // As tall as the chart: no dead space below the last row (the legend sits under the canvas).
  const height = Math.max(320, Math.min(layout.height * view.z, 780));
  const searching = ctx.query.trim() !== "";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-muted/20">
      <div className="relative" style={{ height }}>
      <div
        ref={viewportRef}
        role="tree"
        aria-label="Role hierarchy"
        className={cn("absolute inset-0 touch-none select-none overflow-hidden", dragging ? "cursor-grabbing" : "cursor-grab")}
        style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--color-foreground) 6%, transparent) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: layout.width, height: layout.height, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})` }}
        >
          {/* Tier bands: each level reads as a row, so Admin and IT Designer visibly share one. */}
          {layout.bands.map((b) => (
            <div key={b.tier} className={cn("absolute left-0 w-full", b.tier % 2 === 1 && "bg-muted/30")} style={{ top: b.top, height: b.height }}>
              <span
                className="absolute flex items-center text-overline font-medium uppercase tracking-wider text-muted-foreground/70"
                style={{ left: 16, width: RAIL_W - 24, top: b.tier === 0 ? 48 : GAP_Y / 2, height: CARD_H }}
              >
                {TIER_LABELS[b.tier]}
              </span>
            </div>
          ))}

          {/* Group containers: one dashed outline per group, a coloured dot is the only accent. */}
          {layout.groups.map((g) => (
            <div key={g.label} className="absolute rounded-xl border border-dashed border-border-strong/70" style={{ left: g.left, top: g.top, width: g.width, height: g.height }}>
              <span className="absolute left-3 top-2 flex items-center gap-1.5 text-overline font-medium uppercase tracking-wide text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", g.dot)} aria-hidden />
                {g.label} · <span className="tabular-nums">{g.count}</span>
              </span>
            </div>
          ))}

          {/* Connectors: one SVG layer behind the cards, so lines meet card edges exactly. */}
          <svg className="pointer-events-none absolute left-0 top-0" width={layout.width} height={layout.height} fill="none" aria-hidden>
            {layout.edges.map((e) => (
              <path key={e.key} d={e.d} stroke="var(--color-border-strong)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {layout.edges
              .filter((e) => onPath.has(e.child))
              .map((e) => (
                <path key={`sel-${e.key}`} d={e.d} stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
          </svg>

          {Object.values(layout.nodes).map((n) => {
            const card = ctx.cardOf(n.role);
            const hit = matches(card, ctx.query);
            return (
              <div
                key={n.role}
                role="treeitem"
                aria-level={n.tier + 1}
                aria-selected={ctx.selected === n.role}
                aria-label={`${card.label}, ${ACCESS_LEVELS[card.accessLevel].label}`}
                data-role-item={n.role}
                tabIndex={focusRole === n.role ? 0 : -1}
                onFocus={() => setFocusRole(n.role)}
                onKeyDown={(e) => onItemKey(e, n.role)}
                className="absolute rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ left: n.left, top: n.top, width: CARD_W, height: CARD_H }}
              >
                <RoleNodeCard
                  data={card}
                  selected={ctx.selected === n.role}
                  matched={hit}
                  dimmed={searching && !hit}
                  onOpen={() => ctx.onOpen(n.role)}
                  onViewUsers={() => ctx.onViewUsers(n.role)}
                  onEdit={ctx.onEdit && (() => ctx.onEdit?.(n.role))}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div data-no-pan className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomTo(view.z - 0.1)} disabled={view.z <= MIN_ZOOM} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {Math.round(view.z * 100)}%
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomTo(view.z + 0.1)} disabled={view.z >= MAX_ZOOM} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            adjusted.current = false;
            fit();
          }}
          aria-label="Fit to screen" title="Fit to screen">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            adjusted.current = true;
            setView({ z: 1, tx: Math.min(0, (size.w - layout.width) / 2), ty: 0 });
          }}
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      </div>
      <Legend />
    </div>
  );
}

