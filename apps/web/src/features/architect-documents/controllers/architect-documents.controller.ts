import { useDebouncedValue } from "@/hooks/use-debounced-value";
// controllers/architect-documents.controller.ts
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { ArchitectDocument } from "../types/architect-document.types";

export const useArchitectDocumentsController = () => {
  const [docs, setDocs] = useState<ArchitectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (category !== "all") params.set("category", category);
    setLoading(true);
    apiClient
      .get(`/architect-documents?${params.toString()}`)
      .then((json) => setDocs(json?.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [debouncedQuery, category]);

  const categories = useMemo(() => Array.from(new Set(docs.map((d) => d.category))), [docs]);

  return { docs, loading, query, setQuery, category, setCategory, categories };
};