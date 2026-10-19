import { useEffect, useState } from "react";
import { saveBlob } from "@/lib/file-url";
import { RevisionRepository } from "../repositories/revision.repository";
import type { Revision } from "../types/revision.types";

export const previewKind = (r: Pick<Revision, "mimeType" | "fileName">): "image" | "pdf" | "other" => {
  const name = r.fileName.toLowerCase();
  if (r.mimeType.startsWith("image/") && !r.mimeType.includes("dwg") && !/\.(tif|tiff)$/.test(name)) return "image";
  if (r.mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "other";
};

export async function downloadRevision(r: Pick<Revision, "downloadPath" | "fileName">): Promise<void> {
  saveBlob(await RevisionRepository.file(r.downloadPath), r.fileName);
}

/** Object URL for showing a revision's file inline; null while loading or when the browser cannot render it. */
export function useRevisionFileUrl(revision: Pick<Revision, "id" | "downloadPath" | "mimeType" | "fileName"> | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const renderable = revision ? previewKind(revision) !== "other" : false;
  const id = revision?.id;
  const path = revision?.downloadPath;

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!revision || !renderable || !path) return;
    let active = true;
    let created: string | null = null;
    setLoading(true);
    RevisionRepository.file(path)
      .then((blob) => {
        if (!active) return;
        // Re-type the blob so the browser picks the right viewer.
        const typed = new Blob([blob], { type: previewKind(revision) === "pdf" ? "application/pdf" : revision.mimeType });
        created = URL.createObjectURL(typed);
        setUrl(created);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load the file");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, path, renderable]);

  return { url, error, loading, renderable };
}
