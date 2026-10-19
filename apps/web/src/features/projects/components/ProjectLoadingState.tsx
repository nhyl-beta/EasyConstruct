import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export const ProjectLoadingState: React.FC = () => (
  <Card>
    <CardContent className="p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-3/4 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    </CardContent>
  </Card>
);
