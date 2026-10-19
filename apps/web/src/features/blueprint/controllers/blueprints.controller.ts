import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { Blueprint, CreateBlueprintInput } from "../types/blueprint.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const useBlueprintsController = () => {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [folder, setFolder] = useState("all");
  const [projectCode, setProjectCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (folder !== "all") params.set("folder", folder);
    if (projectCode) params.set("projectCode", projectCode);
    setLoading(true);
    // Was raw fetch() with no Authorization header — authenticate() has
    // always required a Bearer token (apps/api/src/middleware/auth.ts), so
    // this 401'd on every call and the gallery silently showed empty.
    unwrap<Blueprint[]>(apiClient.get(`/blueprints?${params.toString()}`))
      .then((data) => setBlueprints(data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [debouncedQuery, folder, projectCode]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: CreateBlueprintInput): Promise<boolean> => {
    setCreating(true);
    setCreateError(null);
    try {
      await apiClient.post("/blueprints", input);
      await load();
      return true;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create blueprint.");
      return false;
    } finally {
      setCreating(false);
    }
  };

  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  // Part B item 8: the role-gated decision action (server:
  // POST /blueprints/:id/decide) — separate from `create` above and from
  // any generic-PATCH edit, since only Consultant/PM/Admin may call it.
  const decide = async (id: number, approval: "Approved" | "Rejected" | "Revision Required"): Promise<boolean> => {
    setDeciding(true);
    setDecideError(null);
    try {
      await apiClient.post(`/blueprints/${id}/decide`, { approval });
      await load();
      return true;
    } catch (err) {
      setDecideError(err instanceof Error ? err.message : "Failed to record the decision.");
      return false;
    } finally {
      setDeciding(false);
    }
  };

  const folders = useMemo(() => Array.from(new Set(blueprints.map((b) => b.folder))), [blueprints]);
  const favorites = useMemo(() => blueprints.filter((b) => b.favorite), [blueprints]);

  return {
    blueprints,
    favorites,
    loading,
    query,
    setQuery,
    folder,
    setFolder,
    projectCode,
    setProjectCode,
    folders,
    creating,
    createError,
    create,
    deciding,
    decideError,
    decide,
  };
};
