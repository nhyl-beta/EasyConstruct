import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

interface PageContainerProps extends PropsWithChildren {
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      data-page-container
      className={cn(
        "group/page",
        "flex",
        "flex-col",
        "gap-4",
        "md:gap-6",
        "py-4",
        "md:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

PageContainer.displayName = "PageContainer";
