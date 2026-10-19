import { UserAvatar } from "@/components/refine-ui/layout/user-avatar";
import { SignOutButton } from "@/components/ui/auth/sign-out-button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";

export function UserInfo() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className={cn("flex items-center gap-2.5 px-2 py-2")}>
      <UserAvatar className="h-8 w-8" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-overline text-muted-foreground">
          {user.email}
        </span>
      </div>
      <SignOutButton iconOnly className="ml-auto" />
    </div>
  );
}

UserInfo.displayName = "UserInfo";