import React from "react";
import { Project } from "../types/project.types";
import { ProjectCard } from "./ProjectCard";

export const ProjectsGrid: React.FC<{ projects: Project[] }> = ({ projects }) => {
  if (projects.length === 0) return <div className="text-sm text-muted-foreground">No projects</div>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.code} p={p} />
      ))}
    </div>
  );
};
