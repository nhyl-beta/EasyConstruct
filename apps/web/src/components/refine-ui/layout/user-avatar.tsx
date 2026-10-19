import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";

export function UserAvatar({ className }: { className?: string }) {
  const { user } = useAuth();

  if (!user) {
    return <Avatar className={cn("h-10 w-10", className)} />;
  }

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      <AvatarFallback className="bg-primary text-primary-foreground text-overline font-semibold">
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

const getInitials = (name = "") => {
  const names = name.split(" ");
  let initials = names[0].substring(0, 1).toUpperCase();
  if (names.length > 1) {
    initials += names[names.length - 1].substring(0, 1).toUpperCase();
  }
  return initials;
};

UserAvatar.displayName = "UserAvatar";