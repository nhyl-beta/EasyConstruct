import { PageHeader } from "@/components/refine-ui/views/page-header";
import type { ReactNode } from "react";

interface ProjectsHeaderProps {
  subtitle?: string;
  actions?: ReactNode;
}

export function ProjectsHeader({
  subtitle,
  actions,
}: ProjectsHeaderProps) {
  return (
    <PageHeader
      title="Projects"
      description={subtitle ?? "Portfolio overview"}
      actions={actions}
    />
  );
}