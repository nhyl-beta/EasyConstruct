import {
  Archive,
  Binoculars,
  ClipboardCheck,
  Lock,
  Network,
  PencilRuler,
  Ruler,
  UserCog,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";

// Sidebar grouping for the crowded roles. This is navigation only: access is
// still decided by ROLE_RESOURCE_ACCESS (role-resources.ts), and route guards
// live in App.tsx / the server. Header tabs and quick search read
// ROLE_CONFIGS (role-tab.ts) and are deliberately not affected by this file.

export type SidebarNavConfigEntry =
  | { kind: "item"; resource: string }
  | {
      kind: "group";
      id: string;
      label: string;
      icon: LucideIcon;
      children: string[];
    };

export type SidebarNavEntry<T extends { name: string }> =
  | { kind: "item"; item: T }
  | { kind: "group"; id: string; label: string; icon: LucideIcon; items: T[] };

const item = (resource: string): SidebarNavConfigEntry => ({
  kind: "item",
  resource,
});

const group = (
  id: string,
  label: string,
  icon: LucideIcon,
  children: string[],
): SidebarNavConfigEntry => ({ kind: "group", id, label, icon, children });

// "Records & Requests" and "Design Files" are usability groupings, not
// scope-tagged; the rest follow the scope tags noted beside them.
const RECORDS = ["requests", "archive-search", "legacy-import"];

export const SIDEBAR_NAV: Record<string, SidebarNavConfigEntry[]> = {
  admin: [
    item("dashboard"),
    item("admin-projects"),
    item("admin-documents"),
    // Tag C
    group("workflow-management", "Workflow Management", Workflow, [
      "admin-workflows",
      "admin-workflow-configuration",
      "admin-approval-hierarchy",
    ]),
    // Tag D
    group("security-administration", "Security & Administration", Lock, [
      "admin-activity-logs",
      "admin-security",
      "admin-roles-permissions",
    ]),
    // Not scope-tagged
    group("records", "Records", Archive, [
      "requests",
      "archive-search",
      "legacy-import",
      "admin-document-types",
    ]),
    item("admin-support"),
    item("ai-validation-reference"),
  ],
  it_designer: [
    item("dashboard"),
    // Tag G
    group("user-access", "User & Access", UserCog, [
      "it-designer-users",
      "it-designer-roles-permissions",
    ]),
    // Tag E
    group("operations-oversight", "Operations Oversight", Binoculars, [
      "admin-projects",
      "admin-documents",
      "admin-document-types",
      "it-designer-proposals",
    ]),
    // Tags E and F
    group("workflow-management", "Workflow Management", Workflow, [
      "admin-workflows",
      "admin-workflow-configuration",
      "admin-approval-hierarchy",
    ]),
    // Tag E
    group("security-audit", "Security & Audit", Lock, [
      "it-designer-activity-logs",
      "it-designer-security",
    ]),
    item("it-designer-support"),
    item("ai-validation-reference"),
  ],
  project_manager: [
    item("dashboard"),
    item("projects"),
    item("workflows"),
    item("approvals"),
    item("documents"),
    // Tag H
    group("project-delivery", "Project Delivery", ClipboardCheck, [
      "issues",
      "tasks",
      "reports",
    ]),
    // Not scope-tagged
    group("records-requests", "Records & Requests", Archive, RECORDS),
    item("resources"),
    item("ai-validation-reference"),
  ],
  architect: [
    item("dashboard"),
    item("architect-projects"),
    // Tag L
    group("designs-proposals", "Designs & Proposals", PencilRuler, [
      "designs",
      "proposals",
    ]),
    // Not scope-tagged
    group("design-files", "Design Files", Ruler, [
      "blueprints",
      "revisions",
      "architect-documents",
    ]),
    item("approvals"),
    // Not scope-tagged
    group("records-requests", "Records & Requests", Network, RECORDS),
    item("ai-validation-reference"),
  ],
};

export function hasSidebarNavConfig(role: string): boolean {
  return role in SIDEBAR_NAV;
}

/**
 * Orders the role's visible resources into top-level items and collapsible
 * groups. Only resources the role is granted are ever returned; a group left
 * with fewer than two visible children is flattened to plain items, and any
 * granted resource the config does not mention is appended as a plain item so
 * it can never silently vanish. Roles without a config get a flat list.
 */
export function buildSidebarNav<T extends { name: string }>(
  role: string,
  visible: T[],
): SidebarNavEntry<T>[] {
  const allowed = ROLE_RESOURCE_ACCESS[role] ?? [];
  const byName = new Map<string, T>();
  for (const r of visible) {
    if (allowed.includes(r.name) && !byName.has(r.name)) byName.set(r.name, r);
  }

  const used = new Set<string>();
  const take = (name: string): T | undefined => {
    const found = byName.get(name);
    if (!found || used.has(name)) return undefined;
    used.add(name);
    return found;
  };

  const out: SidebarNavEntry<T>[] = [];
  for (const entry of SIDEBAR_NAV[role] ?? []) {
    if (entry.kind === "item") {
      const found = take(entry.resource);
      if (found) out.push({ kind: "item", item: found });
      continue;
    }
    const children = entry.children
      .map(take)
      .filter((c): c is T => c !== undefined);
    if (children.length >= 2) {
      out.push({
        kind: "group",
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        items: children,
      });
    } else {
      for (const c of children) out.push({ kind: "item", item: c });
    }
  }

  for (const [name, found] of byName) {
    if (!used.has(name)) out.push({ kind: "item", item: found });
  }
  return out;
}
