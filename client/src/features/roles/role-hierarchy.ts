import { Briefcase, ClipboardList, Crown, HardHat, Hammer, Ruler, Server, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";

/**
 * The org-chart layout of the ten roles, as data. Display only: a role
 * higher up does NOT inherit what a role below it may do.
 *
 * `parent` is a role key, or `group:<label>` to hang from the middle of a
 * bracket (the connector that joins siblings sharing a `group`). `group` names
 * the bracket a node sits in, among the nodes with the same `parent`.
 * Role keys are the backend `users.role` / `roles.name` values.
 */
export interface RoleHierarchyNode {
  role: string;
  parent: string | null;
  group?: string;
}

export const GOVERNANCE_GROUP = "System governance";

export const ROLE_HIERARCHY: ReadonlyArray<RoleHierarchyNode> = [
  { role: "owner", parent: null },
  // Same row, siblings under Owner.
  { role: "admin", parent: "owner", group: GOVERNANCE_GROUP },
  { role: "it-designer", parent: "owner", group: GOVERNANCE_GROUP },
  // The three departments hang from the middle of the governance bracket.
  { role: "project-manager", parent: `group:${GOVERNANCE_GROUP}`, group: "Project delivery" },
  { role: "human-resources", parent: `group:${GOVERNANCE_GROUP}`, group: "People" },
  { role: "finance-manager", parent: `group:${GOVERNANCE_GROUP}`, group: "Finance" },
  { role: "architect", parent: "project-manager" },
  { role: "engineer", parent: "project-manager" },
  { role: "consultant", parent: "project-manager" },
  { role: "site-personnel", parent: "engineer" },
];

export const ROLE_ICON: Record<string, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  "it-designer": Server,
  "project-manager": ClipboardList,
  "human-resources": Users,
  "finance-manager": Wallet,
  architect: Ruler,
  engineer: HardHat,
  consultant: Briefcase,
  "site-personnel": Hammer,
};

/** Used when the roles table has no label for a key. */
export const ROLE_FALLBACK_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  "it-designer": "IT Designer",
  "project-manager": "Project Manager",
  "human-resources": "HR",
  "finance-manager": "Finance Manager",
  architect: "Architect",
  engineer: "Engineer",
  consultant: "Consultant",
  "site-personnel": "Site Personnel",
};

export const groupParentKey = (label: string) => `group:${label}`;

/** Children of a role or bracket, split into bracket groups (nodes with no group form their own list). */
export function childrenOf(parent: string): { group: string | null; nodes: RoleHierarchyNode[] }[] {
  const kids = ROLE_HIERARCHY.filter((n) => n.parent === parent);
  const out: { group: string | null; nodes: RoleHierarchyNode[] }[] = [];
  for (const n of kids) {
    const g = n.group ?? null;
    const existing = out.find((o) => o.group === g && g !== null);
    if (existing) existing.nodes.push(n);
    else out.push({ group: g, nodes: [n] });
  }
  return out;
}

/** Flattened for the narrow-screen list: depth plus the bracket label a node sits under. */
export function flattenHierarchy(): { node: RoleHierarchyNode; depth: number; group: string | null }[] {
  const out: { node: RoleHierarchyNode; depth: number; group: string | null }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const { group, nodes } of childrenOf(parent)) {
      for (const node of nodes) {
        out.push({ node, depth, group });
        walk(node.role, depth + 1);
      }
      if (group) walk(groupParentKey(group), depth + 1);
    }
  };
  const root = ROLE_HIERARCHY.find((n) => n.parent === null);
  if (root) {
    out.push({ node: root, depth: 0, group: null });
    walk(root.role, 1);
  }
  return out;
}
