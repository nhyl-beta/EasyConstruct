import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** `page-title`; once per page. */
  title: ReactNode;
  /** One calm line under the title: scope, count or date. */
  description?: ReactNode;
  /** Status chips (StatusBadge) on the title row. */
  status?: ReactNode;
  /** Primary action once per row group, then quiet ones. */
  actions?: ReactNode;
  /** The route breadcrumb is on by default; turn it off for non-resource pages. */
  breadcrumb?: boolean;
  /** Replaces the last crumb: the record's name, or the create/edit title. */
  breadcrumbLabel?: string;
  className?: string;
}

/**
 * The one page header: breadcrumb, then the title with status chips and
 * actions on the same row. The KPI row, charts and side panels, then tables
 * follow it. Inside a <PageContainer> it adds the page's side padding itself.
 */
export function PageHeader({
  title,
  description,
  status,
  actions,
  breadcrumb = true,
  breadcrumbLabel,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 group-data-[page-container]/page:px-4 md:group-data-[page-container]/page:px-8",
        className,
      )}
    >
      {breadcrumb && <Breadcrumb label={breadcrumbLabel} />}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-page-title font-semibold tracking-[-0.02em]">
            {title}
          </h1>
          {status}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
      {description && (
        <p className="max-w-2xl text-body text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}
