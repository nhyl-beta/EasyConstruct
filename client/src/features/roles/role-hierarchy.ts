import { Briefcase, ClipboardList, Crown, HardHat, Hammer, Ruler, Server, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";

/**
 * The org-chart layout of the ten roles, as data. Display only: a role
 * higher up does NOT inherit what a role below it may do.
 *
 * - `parent`: a role key, or `group:<label>` to hang from the midpoint of the
 *   pair of roles that sit side by side in that group (Admin + IT Designer).
 *   Array order is left-to-right order.
 * - `group`: the labelled container the role is drawn inside.
 * - `tier`: the horizontal level (row) the role sits on.
 * - `accessLevel`: the scope badge on the card (see ACCESS_LEVELS).
 *
 * Role keys are the backend `users.role` / `roles.name` values.
 */
export type AccessLevel = "full" | "manage" | "monitor" | "operational";

export interface RoleHierarchyNode {
  role: string;
  parent: string | null;
  group: string | null;
  tier: number;
  accessLevel: AccessLevel;
}

export const GOVERNANCE_GROUP = "System governance";

export const ROLE_HIERARCHY: ReadonlyArray<RoleHierarchyNode> = [
  { role: "owner", parent: null, group: null, tier: 0, accessLevel: "full" },
  // Same row, siblings under Owner.
  { role: "admin", parent: "owner", group: GOVERNANCE_GROUP, tier: 1, accessLevel: "monitor" },
  { role: "it-designer", parent: "owner", group: GOVERNANCE_GROUP, tier: 1, accessLevel: "manage" },
  // The department leads hang from the midpoint of the governance pair. People and Finance flank
  // Project delivery (the widest subtree) so the chart comes out symmetric.
  { role: "human-resources", parent: `group:${GOVERNANCE_GROUP}`, group: "People", tier: 2, accessLevel: "operational" },
  { role: "project-manager", parent: `group:${GOVERNANCE_GROUP}`, group: "Project delivery", tier: 2, accessLevel: "operational" },
  { role: "finance-manager", parent: `group:${GOVERNANCE_GROUP}`, group: "Finance", tier: 2, accessLevel: "operational" },
  { role: "architect", parent: "project-manager", group: "Project delivery", tier: 3, accessLevel: "operational" },
  { role: "engineer", parent: "project-manager", group: "Project delivery", tier: 3, accessLevel: "operational" },
  { role: "consultant", parent: "project-manager", group: "Project delivery", tier: 3, accessLevel: "operational" },
  { role: "site-personnel", parent: "engineer", group: "Project delivery", tier: 4, accessLevel: "operational" },
];

export const TIER_LABELS = ["Executive", "Governance", "Department leads", "Project team", "Field"] as const;

/** Group containers: a dot colour from existing tokens, nothing else differs between groups. */
export const GROUPS: ReadonlyArray<{ label: string; dot: string }> = [
  { label: GOVERNANCE_GROUP, dot: "bg-primary" },
  { label: "Project delivery", dot: "bg-chart-2" },
  { label: "People", dot: "bg-chart-4" },
  { label: "Finance", dot: "bg-chart-3" },
];

export const ACCESS_LEVELS: Record<AccessLevel, { label: string; meaning: string }> = {
  full: { label: "Full", meaning: "Oversight of everything" },
  manage: { label: "Manage", meaning: "Manages roles and accounts" },
  monitor: { label: "Monitor", meaning: "Read-only oversight" },
  operational: { label: "Operational", meaning: "Works within assigned projects" },
};

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

export const nodeOf = (role: string): RoleHierarchyNode | undefined => ROLE_HIERARCHY.find((n) => n.role === role);

/** Direct children of a role (or of a `group:` midpoint), in left-to-right order. */
export const childrenOf = (parent: string): RoleHierarchyNode[] => ROLE_HIERARCHY.filter((n) => n.parent === parent);

/** Flattened for the narrow-screen list: depth and tier, in reading order. */
export function flattenHierarchy(): { node: RoleHierarchyNode; depth: number }[] {
  const out: { node: RoleHierarchyNode; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const node of childrenOf(parent)) {
      out.push({ node, depth });
      walk(node.role, depth + 1);
      // Whatever hangs from the midpoint of a pair is listed after the pair.
    }
  };
  const root = ROLE_HIERARCHY.find((n) => n.parent === null);
  if (!root) return out;
  out.push({ node: root, depth: 0 });
  // Governance members first, then the departments that hang from their midpoint.
  const members = childrenOf(root.role);
  for (const m of members) {
    out.push({ node: m, depth: 1 });
    walk(m.role, 2);
  }
  const midpoint = members[0]?.group ? groupParentKey(members[0].group) : null;
  if (midpoint) {
    for (const node of childrenOf(midpoint)) {
      out.push({ node, depth: 2 });
      walk(node.role, 3);
    }
  }
  return out;
}
