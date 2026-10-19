import { FEATURES } from "@/config/features";
import { UserAvatar } from "@/components/refine-ui/layout/user-avatar";
import { ThemeToggle } from "@/components/refine-ui/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useRoleConfig } from "@/hooks/use-role-config";
import { useApprovalsPendingCount } from "@/features/workflows/hooks/useWorkflows";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  useParsed,
  useRefineOptions,
} from "@refinedev/core";
import { useState } from "react";
import { LogOutIcon } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Link, useNavigate } from "react-router";
import { isNavRouteActive } from "@/lib/nav-active";
import { HeaderSearchBar, HeaderSearchButton } from "@/features/quick-search/HeaderSearchTrigger";

export const Header = () => {
  const { isMobile } = useSidebar();
  return <>{isMobile ? <MobileHeader /> : <DesktopHeader />}</>;
};

function DesktopHeader() {
  const { pathname } = useParsed();
  const navigate = useNavigate();
  const { identity, config } = useRoleConfig();
  // Q4: a badge on this bar's own "Approvals" tab. The header renders for
  // every role, so the count is always fetched (cheap — see the hook's own
  // comment on why that's safe for a role with no approvable stage), but
  // only shown below on roles whose tab bar actually has an Approvals tab.
  const approvalsPending = useApprovalsPendingCount();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const ActionIcon = config.primaryAction.icon;

  // C1/C2: was its own independent copy of this exact match rule — same
  // logic as sidebar.tsx's `isActive`, but a second place to edit, which is
  // how the two drifted. Now both import the same `isNavRouteActive`.
  const isTabActive = (route: string) => isNavRouteActive(pathname, route);

  return (
    <div className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <header className="flex h-16 items-center gap-3 px-4 md:px-6">
        {/* Sits at the far left, ahead of the title, so it stays next to the
            workspace name regardless of sidebar state — was previously only
            rendered while the sidebar sat collapsed, so expanding it removed
            the only way to collapse it again. */}
        <SidebarTrigger className="text-muted-foreground" />
        <Separator orientation="vertical" className="h-6" />

        {/* Title block */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "hidden h-2 w-2 shrink-0 rounded-full md:inline-block",
                config.accentBg,
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight tracking-tight">
                {identity.name}'s workspace
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {config.subtitle} · {today}
              </p>
            </div>
            <Badge
              variant="outline"
              className="ml-1 hidden rounded-full border-border text-overline font-medium uppercase tracking-wide text-muted-foreground lg:inline-flex"
            >
              {config.initials}
            </Badge>
          </div>

          <HeaderSearchBar />
        </div>

        <ThemeToggle />
        <NotificationBell />

        {config.primaryAction.route && (
          <Button asChild size="sm">
            <Link to={config.primaryAction.route}>
              <ActionIcon className="h-4 w-4" />
              <span className="hidden sm:inline">
                {config.primaryAction.label}
              </span>
            </Link>
          </Button>
        )}

        <UserDropdown />
      </header>

      <nav className="flex h-11 items-center gap-1 overflow-x-auto border-t bg-muted/30 px-4 md:px-6">
        {config.tabs.map((tab) => {
          const TabIcon = tab.icon;
          const active = isTabActive(tab.route);
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.route)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3",
                "text-xs font-medium transition-all duration-150",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.route === "/approvals" && approvalsPending > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-overline font-medium tabular-nums text-destructive-foreground">
                  {approvalsPending > 9 ? "9+" : approvalsPending}
                </span>
              )}
            </button>
          );
        })}
        {FEATURES.aiPlaceholders && (
          <span className="ml-auto hidden text-overline text-muted-foreground md:inline">
            AI · {config.primaryAi}
          </span>
        )}
      </nav>
    </div>
  );
}

function MobileHeader() {
  const { open, isMobile } = useSidebar();
  const { title } = useRefineOptions();

  return (
    <header
      className={cn(
        "sticky",
        "top-0",
        "flex",
        "h-12",
        "shrink-0",
        "items-center",
        "gap-2",
        "border-b",
        "border-border",
        "bg-sidebar",
        "pr-3",
        "justify-between",
        "z-40",
      )}
    >
      <SidebarTrigger
        className={cn("text-muted-foreground", "rotate-180", "ml-1", {
          "opacity-0": open,
          "opacity-100": !open || isMobile,
          "pointer-events-auto": !open || isMobile,
          "pointer-events-none": open && !isMobile,
        })}
      />
      <div
        className={cn(
          "whitespace-nowrap",
          "flex",
          "flex-row",
          "h-full",
          "items-center",
          "justify-start",
          "gap-2",
          "transition-discrete",
          "duration-200",
          { "pl-3": !open, "pl-5": open },
        )}
      >
        <div>{title.icon}</div>
        <h2
          className={cn(
            "text-sm",
            "font-bold",
            "transition-opacity",
            "duration-200",
            { "opacity-0": !open, "opacity-100": open },
          )}
        >
          {title.text}
        </h2>
      </div>
      <div className="flex items-center">
        <HeaderSearchButton className="h-8 w-8 text-muted-foreground" />
        <ThemeToggle className={cn("h-8", "w-8")} />
      </div>
    </header>
  );
}

// The second way out of the app, alongside the sidebar's SignOutButton. It
// ended the session on the first click and did not even leave the page, so
// the user was left looking at a signed-out shell. Both paths now confirm
// first and then land on /login.
const UserDropdown = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <UserAvatar />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setConfirming(true)}>
            <LogOutIcon className={cn("text-destructive-strong")} />
            <span className={cn("text-destructive-strong")}>
              Logout
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out of EasyConstruct?"
        description="Your session will end and any unsaved changes on this page will be lost. You'll need to sign in again to continue."
        confirmLabel="Sign out"
        onConfirm={() => {
          setConfirming(false);
          logout();
          navigate("/login");
        }}
      />
    </>
  );
};

Header.displayName = "Header";
MobileHeader.displayName = "MobileHeader";
DesktopHeader.displayName = "DesktopHeader";
