/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildSidebarNav,
  hasSidebarNavConfig,
} from "@/config/sidebar-nav";
import { RESOURCE_ICONS } from "@/config/resource-icons";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { useRoleConfig } from "@/hooks/use-role-config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";
import { SignOutButton } from "@/components/ui/auth/sign-out-button";
import { useMenu, useParsed, type TreeMenuItem } from "@refinedev/core";
import { ChevronRight, ListIcon, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useApprovalsPendingCount } from "@/features/workflows/hooks/useWorkflows";
import { isNavRouteActive } from "@/lib/nav-active";
// ── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_ORDER = [
  "Workspace",
  "Operations",
  "Monitoring",
  "Configuration",
  "Support",
  "Intelligence",
];

function groupMenuItems(items: TreeMenuItem[], role: string) {
  const allowed = ROLE_RESOURCE_ACCESS[role] ?? [];

  // ✅ Filter out resources not allowed for this role
  const filtered = items.filter((item) => allowed.includes(item.name));

  const groups: Record<string, TreeMenuItem[]> = {};

  filtered.forEach((item) => {
    const group = (item.meta?.group as string) ?? "Workspace";
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  });

  const ordered = SECTION_ORDER.filter((g) => groups[g]);
  const extras = Object.keys(groups).filter((g) => !SECTION_ORDER.includes(g));

  return [...ordered, ...extras].map((label) => ({
    label,
    items: groups[label] ?? [],
  }));
}

function getIcon(item: TreeMenuItem) {
  const Mapped = RESOURCE_ICONS[item.name];
  return Mapped ?? ListIcon;
}

// Q4: a red dot with the pending count on the "Approvals" nav entry — every
// role that has that entry shares the same "approvals" resource, so this
// isn't finance-specific even though that's the report it came from.
// A separate component (not inlined in the item.map below) so the
// pending-count fetch only happens for roles that actually render this item.
function ApprovalsBadge() {
  const pending = useApprovalsPendingCount();
  if (pending === 0) return null;
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-overline font-medium tabular-nums text-destructive-foreground group-data-[collapsible=icon]:hidden">
      {pending > 9 ? "9+" : pending}
    </span>
  );
}

const ACTIVE_CLASSES =
  "bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground";

const labelOf = (item: TreeMenuItem) =>
  (item.meta?.label as string | undefined) ?? item.label ?? item.name;

function NavLeaf({
  item,
  active,
  onNavigate,
}: {
  item: TreeMenuItem;
  active: boolean;
  onNavigate: (route: string) => void;
}) {
  const Icon = getIcon(item);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={labelOf(item)}
        onClick={() => onNavigate(item.route ?? "/")}
        className={cn("cursor-pointer", "w-full", { [ACTIVE_CLASSES]: active })}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {/* Explicit truncate: this span used to rely on the
            component's own `[&>span:last-child]:truncate`
            rule, which now targets the badge span below
            instead once one is present. */}
        <span className="min-w-0 truncate">{labelOf(item)}</span>
        {item.name === "approvals" && <ApprovalsBadge />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// A parent has no route of its own: it expands/collapses in the full sidebar
// and opens a flyout when the sidebar is icon-collapsed (the sub list is
// hidden by CSS in that mode).
function NavGroup({
  label,
  icon: Icon,
  items,
  isActive,
  onNavigate,
}: {
  label: string;
  icon: LucideIcon;
  items: TreeMenuItem[];
  isActive: (route: string) => boolean;
  onNavigate: (route: string) => void;
}) {
  const { state, isMobile } = useSidebar();
  const anyActive = items.some((i) => isActive(i.route ?? ""));
  const [open, setOpen] = useState(anyActive);

  // Open when a child becomes the active route (load, refresh, back/forward).
  useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  const parentClasses = cn("cursor-pointer", "w-full", {
    "font-medium": anyActive,
  });

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              isActive={anyActive}
              tooltip={label}
              aria-label={label}
              className={parentClasses}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-44">
            {items.map((item) => {
              const active = isActive(item.route ?? "");
              return (
                <DropdownMenuItem
                  key={item.key || item.name}
                  aria-current={active ? "page" : undefined}
                  onSelect={() => onNavigate(item.route ?? "/")}
                  className={cn("cursor-pointer", {
                    "bg-sidebar-primary font-semibold text-sidebar-primary-foreground focus:bg-sidebar-primary/90 focus:text-sidebar-primary-foreground":
                      active,
                  })}
                >
                  {labelOf(item)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={anyActive}
            tooltip={label}
            className={cn(parentClasses, "group/nav-group")}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="min-w-0 truncate">{label}</span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]/nav-group:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => {
              const active = isActive(item.route ?? "");
              return (
                <SidebarMenuSubItem key={item.key || item.name}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => onNavigate(item.route ?? "/")}
                      className={cn("w-full cursor-pointer text-left", {
                        [ACTIVE_CLASSES]: active,
                      })}
                    >
                      <span className="min-w-0 truncate">{labelOf(item)}</span>
                    </button>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { menuItems, selectedKey } = useMenu();
  const { pathname } = useParsed();
  const navigate = useNavigate();
  const { identity, config } = useRoleConfig();
  const { user } = useAuth();
  const AvatarIcon = config.icon;

  const grouped = hasSidebarNavConfig(identity.role);
  const nav = grouped ? buildSidebarNav(identity.role, menuItems) : [];
  const sections = grouped ? [] : groupMenuItems(menuItems, identity.role);

  // C1/C2: shared with header.tsx's `isTabActive` — same rule, one place.
  const isActive = (route: string) => isNavRouteActive(pathname, route);

  return (
    <ShadcnSidebar
      collapsible="icon"
      className={cn("border-r", "border-border")}
    >
      <SidebarRail />

      {/* ── Header ── */}
      <SidebarHeader
        className={cn(
          "h-16",
          "border-b",
          "border-border",
          "flex",
          "items-center",
          "justify-between",
          "px-3",
        )}
      >
        <AppSidebarHeader />
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent>
        {grouped && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((entry) =>
                  entry.kind === "item" ? (
                    <NavLeaf
                      key={entry.item.key || entry.item.name}
                      item={entry.item}
                      active={isActive(entry.item.route ?? "")}
                      onNavigate={navigate}
                    />
                  ) : (
                    <NavGroup
                      key={entry.id}
                      label={entry.label}
                      icon={entry.icon}
                      items={entry.items}
                      isActive={isActive}
                      onNavigate={navigate}
                    />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavLeaf
                    key={item.key || item.name}
                    item={item}
                    active={isActive(item.route ?? "")}
                    onNavigate={navigate}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Footer — user identity ── */}
      <SidebarFooter className={cn("border-t", "border-border")}>
        <div className={cn("flex", "items-center", "gap-2.5", "px-2", "py-3")}>
          {/* Avatar */}
          <div
            className={cn(
              "flex", "h-8", "w-8", "shrink-0", "items-center", "justify-center",
              "rounded-lg", "bg-primary-soft", "text-primary-strong", "text-xs", "font-semibold",
            )}
          >
            <AvatarIcon className="h-4 w-4" />
          </div>

          {/* Name + workspace label — hidden when collapsed */}
          <div
            className={cn(
              "flex", "min-w-0", "flex-col", "leading-tight",
              "group-data-[collapsible=icon]:hidden",
            )}
          >
            <span className="truncate text-sm font-medium text-foreground">
              {identity.name}
            </span>
            {/* FLAG: identity has no email field. Showing user?.email from
                useAuth() as a fallback so the real signed-in email appears
                when available, but this is two identity sources side by
                side, not yet unified — see note below. */}
            <span className="truncate text-overline text-muted-foreground">
              {user?.email ?? `${config.label} workspace`}
            </span>
          </div>

          {/* Sign out — icon-only, hidden when collapsed */}
          <SignOutButton
            iconOnly
            className={cn("ml-auto", "group-data-[collapsible=icon]:hidden")}
          />
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}

// ── Sidebar Header — app title + collapse trigger ─────────────────────────────

function AppSidebarHeader() {
  const { open, isMobile } = useSidebar();
  const { config } = useRoleConfig();
  const AvatarIcon = config.icon;

  return (
    <div className={cn("flex", "w-full", "items-center", "justify-between")}>
      {/* Left: avatar + role name */}
      <div className={cn("flex", "items-center", "gap-2", "min-w-0")}>
        <div
          className={cn(
            "flex",
            "shrink-0",
            "items-center",
            "justify-center",
            "rounded-lg",
            "bg-primary-soft",
            "text-primary-strong",
            "transition-all",
            "duration-200",
            { "h-8 w-8": open, "h-7 w-7": !open },
          )}
        >
          <AvatarIcon className="h-4 w-4" />
        </div>

        <div
          className={cn(
            "flex",
            "min-w-0",
            "flex-col",
            "transition-all",
            "duration-200",
            "group-data-[collapsible=icon]:hidden",
          )}
        >
          <span className="truncate text-sm font-semibold text-foreground leading-tight">
            {config.label}
          </span>
          <span className="truncate text-overline text-muted-foreground font-medium uppercase tracking-[0.06em] leading-tight">
            Construction Operations
          </span>
        </div>
      </div>
    </div>
  );
}

Sidebar.displayName = "Sidebar";
