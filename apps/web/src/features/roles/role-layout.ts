import { hierarchy, tree, type HierarchyNode } from "d3-hierarchy";

import { GROUPS, ROLE_HIERARCHY, childrenOf, groupParentKey, nodeOf, type RoleHierarchyNode } from "./role-hierarchy";

/** Geometry, in px at 100% zoom. */
export const CARD_W = 256;
export const CARD_H = 96;
export const GAP_X = 32;
export const GAP_Y = 72;
export const RAIL_W = 124;
export const PAD = 48;
const GROUP_PAD = { l: 14, r: 14, t: 34, b: 14 };
const CORNER = 6;

export interface PlacedNode {
  role: string;
  left: number;
  top: number;
  /** Centre x. */
  cx: number;
  tier: number;
}

export interface PlacedGroup {
  label: string;
  dot: string;
  left: number;
  top: number;
  width: number;
  height: number;
  count: number;
}

export interface PlacedEdge {
  key: string;
  /** The node this edge leads into; the edge is highlighted when it lies on the selected node's path from Owner. */
  child: string;
  d: string;
}

export interface PlacedBand {
  tier: number;
  top: number;
  height: number;
}

export interface RoleLayout {
  width: number;
  height: number;
  nodes: Record<string, PlacedNode>;
  groups: PlacedGroup[];
  edges: PlacedEdge[];
  bands: PlacedBand[];
  /** Edge keys on the path from Owner to a role (`gov` stands for the Admin + IT Designer pair). */
  pathTo: (role: string) => string[];
}

interface Datum {
  id: string;
  children?: Datum[];
}

const GOV = "gov";

/** Rounded orthogonal elbow: down from (px, py), across a bus at busY, down into (cx, cy). */
export function elbow(px: number, py: number, cx: number, cy: number, busY: number): string {
  if (Math.abs(cx - px) < 0.5) return `M${px},${py} V${cy}`;
  const dir = cx > px ? 1 : -1;
  const r = Math.min(CORNER, Math.abs(cx - px) / 2, Math.max(0, busY - py), Math.max(0, cy - busY));
  return [
    `M${px},${py}`,
    `V${busY - r}`,
    `Q${px},${busY} ${px + dir * r},${busY}`,
    `H${cx - dir * r}`,
    `Q${cx},${busY} ${cx},${busY + r}`,
    `V${cy}`,
  ].join(" ");
}

/**
 * Computes the whole chart: node positions (d3-hierarchy `tree`), group
 * containers, tier bands and connector paths. Admin + IT Designer are laid out
 * as one virtual parent, so the department row is centred under the pair.
 */
export function computeRoleLayout(nodes: ReadonlyArray<RoleHierarchyNode> = ROLE_HIERARCHY): RoleLayout {
  const root = nodes.find((n) => n.parent === null)!;
  const pairLabel = childrenOf(root.role)[0]?.group ?? null;
  const midpointKey = pairLabel ? groupParentKey(pairLabel) : null;
  const pair = childrenOf(root.role);
  const hasMidpointKids = midpointKey ? childrenOf(midpointKey).length > 0 : false;

  const build = (role: string): Datum => {
    const kids = childrenOf(role);
    // The governance pair collapses into one virtual node under Owner.
    if (role === root.role && hasMidpointKids) {
      return { id: role, children: [{ id: GOV, children: childrenOf(midpointKey!).map((n) => build(n.role)) }] };
    }
    return { id: role, children: kids.length ? kids.map((k) => build(k.role)) : undefined };
  };

  const h = hierarchy<Datum>(build(root.role));
  const leaves = (n: HierarchyNode<Datum>) => Math.max(1, n.leaves().length);
  const groupOf = (n: HierarchyNode<Datum>) => nodeOf(n.data.id)?.group ?? null;
  const layout = tree<Datum>()
    .nodeSize([CARD_W + GAP_X, CARD_H + GAP_Y])
    .separation((a, b) => {
      // Siblings are spaced by the width of their subtrees; different groups get extra air.
      const base = (leaves(a) + leaves(b)) / 2;
      return base + (groupOf(a) !== groupOf(b) ? 0.15 : 0);
    });
  layout(h);

  const rowGap = CARD_H + GAP_Y;
  const rowTop = (depth: number) => PAD + depth * rowGap;

  // Raw centres, then shifted so the leftmost group box starts after the tier rail.
  const raw: Record<string, { cx: number; depth: number }> = {};
  let govCx = 0;
  h.each((n) => {
    if (n.data.id === GOV) govCx = n.x!;
    else raw[n.data.id] = { cx: n.x!, depth: n.depth };
  });
  if (pair.length) {
    const offset = (CARD_W + GAP_X) / 2;
    pair.forEach((m, i) => {
      raw[m.role] = { cx: govCx + (i === 0 ? -offset : offset), depth: 1 };
    });
  }

  const placed: Record<string, PlacedNode> = {};
  const unshifted = Object.entries(raw).map(([role, v]) => ({
    role,
    left: v.cx - CARD_W / 2,
    top: rowTop(v.depth),
    cx: v.cx,
    tier: nodeOf(role)?.tier ?? v.depth,
  }));

  // Group boxes first (unshifted), so the shift accounts for their padding.
  const rawGroups = GROUPS.map((g) => {
    const members = unshifted.filter((n) => nodeOf(n.role)?.group === g.label);
    if (members.length === 0) return null;
    const left = Math.min(...members.map((m) => m.left)) - GROUP_PAD.l;
    const right = Math.max(...members.map((m) => m.left + CARD_W)) + GROUP_PAD.r;
    const top = Math.min(...members.map((m) => m.top)) - GROUP_PAD.t;
    const bottom = Math.max(...members.map((m) => m.top + CARD_H)) + GROUP_PAD.b;
    return { label: g.label, dot: g.dot, left, top, width: right - left, height: bottom - top, count: members.length };
  }).filter((g): g is PlacedGroup => g !== null);

  const minX = Math.min(...unshifted.map((n) => n.left), ...rawGroups.map((g) => g.left));
  const maxX = Math.max(...unshifted.map((n) => n.left + CARD_W), ...rawGroups.map((g) => g.left + g.width));
  const dx = RAIL_W + PAD - minX;
  for (const n of unshifted) placed[n.role] = { ...n, left: n.left + dx, cx: n.cx + dx };
  const groups = rawGroups.map((g) => ({ ...g, left: g.left + dx }));
  const width = maxX - minX + RAIL_W + PAD + 24;
  const depths = Math.max(...Object.values(raw).map((v) => v.depth)) + 1;
  const height = depths * rowGap - GAP_Y + PAD + 24;

  const bands: PlacedBand[] = Array.from({ length: depths }, (_, d) => ({
    tier: d,
    top: d === 0 ? 0 : rowTop(d) - GAP_Y / 2,
    height: (d === depths - 1 ? height : rowTop(d) + CARD_H + GAP_Y / 2) - (d === 0 ? 0 : rowTop(d) - GAP_Y / 2),
  }));

  // Connectors.
  const edges: PlacedEdge[] = [];
  const bottom = (r: string) => placed[r]!.top + CARD_H;
  const drop = (parentX: number, parentY: number, child: string, key: string, childKey = child) => {
    const c = placed[child]!;
    edges.push({ key, child: childKey, d: elbow(parentX, parentY, c.cx, c.top, c.top - 44) });
  };

  for (const n of nodes) {
    if (n.parent === null) continue;
    if (n.parent.startsWith("group:")) continue; // departments: drawn from the pair midpoint below
    const p = placed[n.parent]!;
    // Owner -> each governance member: one bus feeding both (both belong to the pair).
    drop(p.cx, bottom(n.parent), n.role, `${n.parent}->${n.role}`, pair.some((m) => m.role === n.role) ? GOV : n.role);
  }
  if (pair.length === 2 && midpointKey) {
    const a = placed[pair[0]!.role]!;
    const b = placed[pair[1]!.role]!;
    const midY = a.top + CARD_H / 2;
    const mx = (a.cx + b.cx) / 2;
    // The link between the two cards, then each department drops from its centre.
    edges.push({ key: "pair-link", child: GOV, d: `M${a.left + CARD_W},${midY} H${b.left}` });
    for (const dept of childrenOf(midpointKey)) {
      const c = placed[dept.role]!;
      edges.push({ key: `gov->${dept.role}`, child: dept.role, d: elbow(mx, midY, c.cx, c.top, c.top - 44) });
    }
  }

  /** Edge keys that lead from Owner to `role`: the role, each ancestor, and GOV when the path crosses the pair. */
  const pathTo = (role: string): string[] => {
    const keys: string[] = [];
    let cur = nodeOf(role);
    while (cur) {
      keys.push(cur.role);
      if (pair.some((m) => m.role === cur!.role)) keys.push(GOV);
      if (cur.parent?.startsWith("group:")) {
        keys.push(GOV);
        cur = root;
      } else {
        cur = cur.parent ? nodeOf(cur.parent) : undefined;
      }
    }
    return keys;
  };

  return { width, height, nodes: placed, groups, edges, bands, pathTo };
}

/** Keyboard target for an arrow key: parent, first child, or the neighbour on the same row. */
export function neighbour(layout: RoleLayout, role: string, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"): string | null {
  const me = layout.nodes[role];
  const node = nodeOf(role);
  if (!me || !node) return null;
  // Nearest by centre; on a tie (Owner sits exactly between Admin and IT Designer) the left one.
  const nearest = (cands: PlacedNode[]) => [...cands].sort((a, b) => Math.round(Math.abs(a.cx - me.cx)) - Math.round(Math.abs(b.cx - me.cx)) || a.cx - b.cx)[0]?.role ?? null;
  const row = (tier: number) => Object.values(layout.nodes).filter((n) => n.tier === tier);

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const sideways = row(me.tier)
      .filter((n) => (key === "ArrowLeft" ? n.cx < me.cx : n.cx > me.cx))
      .sort((a, b) => (key === "ArrowLeft" ? b.cx - a.cx : a.cx - b.cx));
    return sideways[0]?.role ?? null;
  }
  if (key === "ArrowUp") {
    if (!node.parent) return null;
    return node.parent.startsWith("group:") ? nearest(row(node.tier - 1)) : node.parent;
  }
  const kids = childrenOf(node.role).filter((k) => !k.parent?.startsWith("group:"));
  if (kids.length) return nearest(kids.map((k) => layout.nodes[k.role]!));
  // A governance member has no children of its own; go down to the department row.
  const next = row(node.tier + 1);
  return next.length && node.group ? nearest(next) : null;
}
