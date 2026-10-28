import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";

interface ProjectEmptyStateProps {
  /** False for read-only roles (IT Designer): no hint about creating a project and no Create button. */
  canCreate?: boolean;
}

export const ProjectEmptyState: React.FC<ProjectEmptyStateProps> = ({ canCreate = true }) => (
  <Card>
    <CardContent className="p-6 text-center">
      <div className="text-lg font-medium">No projects found</div>
      <p className="text-sm text-muted-foreground">
        {canCreate ? "Try adjusting filters or create a new project." : "Try adjusting your search or filters."}
      </p>
      {canCreate && (
        <div className="mt-4">
          <Button asChild>
            <Link to="/projects/new">Create project</Link>
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
);
