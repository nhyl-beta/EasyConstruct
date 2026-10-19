import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { Design } from "../types/design.types";

interface ProjectSummary {
  id: number;
  name: string;
  code: string;
  status: string;
  risk: string;
  progress: number;
  due: string;
  designCount: number;
}

/**
 * The projects and designs the signed-in Architect may see. Uses apiClient (Authorization header
 * and VITE_API_BASE), like the other design controllers. It used to be two raw fetch() calls with
 * no token, so the server answered 401 and the page silently showed an empty list. A failure is
 * thrown so the page can show it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchArchitectProjectData(): Promise<{ projects: any[]; designs: Design[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projJson, designJson] = (await Promise.all([apiClient.get("/projects"), apiClient.get("/designs")])) as any[];
  return { projects: projJson?.data ?? [], designs: designJson?.data ?? [] };
}

export const useArchitectProjectsController = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, setProjects] = useState<any[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchArchitectProjectData()
      .then((data) => {
        setProjects(data.projects);
        setDesigns(data.designs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your projects."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scopedProjects: ProjectSummary[] = useMemo(() => {
    const codesWithDesigns = new Set(designs.map((d) => d.projectCode));
    return projects
      .filter((p) => codesWithDesigns.has(p.code))
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        risk: p.risk,
        progress: p.progress,
        due: p.due,
        designCount: designs.filter((d) => d.projectCode === p.code).length,
      }))
      .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.code.toLowerCase().includes(query.toLowerCase()));
  }, [projects, designs, query]);

  return { projects: scopedProjects, loading, error, reload: load, query, setQuery };
};