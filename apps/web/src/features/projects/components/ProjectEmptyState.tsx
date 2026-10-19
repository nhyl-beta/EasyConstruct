import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";

export const ProjectEmptyState: React.FC = () => (
  <Card>
    <CardContent className="p-6 text-center">
      <div className="text-lg font-medium">No projects found</div>
      <p className="text-sm text-muted-foreground">Try adjusting filters or create a new project.</p>
      <div className="mt-4">
        <Button asChild>
          <Link to="/projects/new">Create project</Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);
