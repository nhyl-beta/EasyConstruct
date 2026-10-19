import { useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { RevisionItemType } from "../types/revision.types";

export interface ItemOption {
  id: number;
  label: string;
}

interface Row {
  id: number;
  projectCode?: string | null;
  project?: string;
  designId?: number | null;
  code?: string;
  name?: string;
  title?: string;
  drawingNumber?: string;
}

const rows = async (path: string): Promise<Row[]> => {
  const json = (await apiClient.get(path)) as { data?: Row[] };
  return json?.data ?? [];
};

/** Existing records of one type on one project that can be versioned. */
export function useRevisionItemOptions(project: string, type: RevisionItemType) {
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const enc = encodeURIComponent(project);
    const load = async (): Promise<ItemOption[]> => {
      switch (type) {
        case "design":
          return (await rows(`/designs?projectCode=${enc}`)).map((d) => ({ id: d.id, label: `${d.code} · ${d.name}` }));
        case "blueprint":
          return (await rows(`/blueprints?projectCode=${enc}`)).map((b) => ({ id: b.id, label: `${b.drawingNumber} · ${b.title}` }));
        case "document":
          return (await rows(`/documents?project=${enc}`)).map((d) => ({ id: d.id, label: d.title ?? `Document ${d.id}` }));
        case "plan": {
          // Plans/drawings live in the Documentation hub; they belong to a
          // project directly or through the design they were filed under.
          const [designs, plans] = await Promise.all([rows(`/designs?projectCode=${enc}`), rows("/architect-documents")]);
          const designIds = new Set(designs.map((d) => d.id));
          return plans
            .filter((p) => p.projectCode === project || (p.designId != null && designIds.has(p.designId)))
            .map((p) => ({ id: p.id, label: p.title ?? `Plan ${p.id}` }));
        }
      }
    };
    load()
      .then((result) => {
        if (!cancelled) setOptions(result);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, type]);

  return { options, loading };
}
