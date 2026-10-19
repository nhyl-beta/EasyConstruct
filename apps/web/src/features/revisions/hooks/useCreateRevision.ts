import { useCallback, useState } from "react";
import { uploadLargeFile } from "@/features/uploads/lib/upload-file";
import { RevisionRepository } from "../repositories/revision.repository";
import type { CreateRevisionInput, Revision } from "../types/revision.types";

/**
 * Upload the file through the shared large-file utility (progress, size and
 * type checks), then record the revision. The server assigns the version
 * number, so two people uploading at once cannot collide.
 */
export function useCreateRevision() {
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: Omit<CreateRevisionInput, "file">, file: File): Promise<Revision | null> => {
      setSubmitting(true);
      setError(null);
      setProgress(0);
      try {
        const stored = await uploadLargeFile(file, setProgress);
        return await RevisionRepository.create({
          ...input,
          file: {
            url: stored.url,
            fileName: stored.filename,
            fileSize: stored.sizeBytes,
            mimeType: stored.contentType,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the revision");
        return null;
      } finally {
        setSubmitting(false);
        setProgress(null);
      }
    },
    [],
  );

  return { create, submitting, progress, error, clearError: () => setError(null) } as const;
}
