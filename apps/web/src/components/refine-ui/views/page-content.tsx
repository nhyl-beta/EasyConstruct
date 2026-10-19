import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

interface PageContentProps extends PropsWithChildren {
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div
      className={cn(
        "w-full",
        "rounded-lg",
        "border",
        "border-border",
        "bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

PageContent.displayName = "PageContent";
