import { Project } from "../types/project.types";

// Thin model layer: potential place for adapters, computed fields, and normalization.
export type ProjectModel = Project;

export const adaptProject = (p: Project): ProjectModel => ({ ...p });
