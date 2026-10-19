import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ACCESS_LEVELS, ROLE_ICON, type AccessLevel } from "../role-hierarchy";

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Small outline badge for a role's access level. The legend explains each one. */
export function AccessBadge({ level, className }: { level: AccessLevel; className?: string }) {
  return (
    <Badge variant="outline" className={cn("h-5 rounded-full px-1.5 text-[10px] font-medium", className)}>
      {ACCESS_LEVELS[level].label}
    </Badge>
  );
}

/** The 40px tinted tile holding a role's icon. */
export function RoleIconTile({ role, className }: { role: string; className?: string }) {
  const Icon = ROLE_ICON[role] ?? ROLE_ICON.admin!;
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-strong", className)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

export function AvatarStack({ names, extra }: { names: string[]; extra: number }) {
  if (names.length === 0) return null;
  return (
    <span className="flex items-center">
      {names.map((n, i) => (
        <span
          key={`${n}-${i}`}
          title={n}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground ring-2 ring-card",
            i > 0 && "-ml-2",
          )}
        >
          {initials(n)}
        </span>
      ))}
      {extra > 0 && <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">+{extra}</span>}
    </span>
  );
}

export interface RoleCardData {
  role: string;
  label: string;
  accessLevel: AccessLevel;
  userNames: string[];
  /** null while counts are loading or unavailable. */
  userCount: number | null;
  pageCount: number;
}

interface RoleNodeCardProps {
  data: RoleCardData;
  selected: boolean;
  dimmed?: boolean;
  matched?: boolean;
  onOpen: () => void;
  onViewUsers: () => void;
  /** Only passed when the viewer can manage roles. */
  onEdit?: () => void;
  /** Compact form for the narrow-screen list. */
  compact?: boolean;
}

export function RoleNodeCard({ data, selected, dimmed, matched, onOpen, onViewUsers, onEdit, compact }: RoleNodeCardProps) {
  const meta =
    data.userCount === null ? "—" : data.userCount === 0 ? "No users yet" : `${data.userCount} ${data.userCount === 1 ? "user" : "users"} · ${data.pageCount} pages`;

  return (
    <div
      className={cn(
        "group/card relative flex items-center gap-2 rounded-lg border bg-card p-2 text-left shadow-sm outline-none",
        "transition-[box-shadow,border-color,transform,opacity] duration-150 ease-out motion-reduce:transition-none",
        "hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        matched && !selected && "border-primary/60 ring-2 ring-primary/10",
        dimmed && "opacity-30",
        compact ? "w-full" : "h-full w-full",
      )}
      onClick={onOpen}
    >
      <RoleIconTile role={data.role} />
      <div className="min-w-0 flex-1 self-stretch">
        <div className="flex items-start justify-between gap-1.5">
          <p className="truncate text-sm font-semibold leading-5">{data.label}</p>
          <span className="relative -mr-0.5 -mt-0.5 h-5 shrink-0">
            <AccessBadge level={data.accessLevel} className="transition-opacity duration-150 group-hover/card:opacity-0 group-focus-within/card:opacity-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tabIndex={-1}
                  className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
                  aria-label={`${data.label} actions`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onOpen}>View details</DropdownMenuItem>
                {onEdit && <DropdownMenuItem onSelect={onEdit}>Edit permissions</DropdownMenuItem>}
                <DropdownMenuItem onSelect={onViewUsers}>View users</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{data.role}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <AvatarStack names={data.userNames.slice(0, 3)} extra={Math.max(0, (data.userCount ?? 0) - 3)} />
          <span className={cn("truncate text-[11px] text-muted-foreground tabular-nums", data.userCount === 0 && "italic")}>{meta}</span>
        </div>
      </div>
    </div>
  );
}
