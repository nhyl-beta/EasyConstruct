import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface ComingSoonCardProps {
  title: string;
  description?: string;
}

export function ComingSoonCard({
  title,
  description,
}: ComingSoonCardProps) {
  return (
    <div
      className={cn(
        "flex",
        "flex-col",
        "items-center",
        "justify-center",
        "gap-3",
        "rounded-lg",
        "border",
        "border-dashed",
        "border-border",
        "bg-muted/50",
        "px-6",
        "py-12",
        "text-center",
      )}
    >
      <div className={cn("flex", "items-center", "justify-center", "rounded-full", "bg-muted", "p-3")}>
        <Sparkles className={cn("h-5", "w-5", "text-muted-foreground")} />
      </div>
      <div className={cn("flex", "flex-col", "gap-1")}>
        <h3 className={cn("font-semibold", "text-foreground")}>
          {title}
        </h3>
        {description && (
          <p className={cn("text-sm", "text-muted-foreground", "max-w-xs")}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

ComingSoonCard.displayName = "ComingSoonCard";
