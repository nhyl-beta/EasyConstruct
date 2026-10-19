import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex",
        "flex-col",
        "items-center",
        "justify-center",
        "gap-4",
        "rounded-lg",
        "border",
        "border-border",
        "bg-muted/50",
        "px-6",
        "py-16",
        "text-center",
      )}
    >
      <div className={cn("flex", "items-center", "justify-center")}>
        {icon || <AlertCircle className={cn("h-8", "w-8", "text-muted-foreground")} />}
      </div>
      <div className={cn("flex", "flex-col", "gap-2")}>
        <h3 className={cn("font-semibold", "text-lg", "text-foreground")}>
          {title}
        </h3>
        {description && (
          <p className={cn("text-sm", "text-muted-foreground", "max-w-sm")}>
            {description}
          </p>
        )}
      </div>
      {action && <div className={cn("mt-2")}>{action}</div>}
    </div>
  );
}

EmptyState.displayName = "EmptyState";
