import { useCallback, useState } from "react";
import { uploadsRepository } from "../repositories/uploads.repository";

export function useUploadFile() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadDataUrl = useCallback(async (filename: string, contentType: string, dataUrl: string) => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadsRepository.upload(filename, contentType, dataUrl);
      return res.data.url;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  }, []);

  const uploadFile = useCallback(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const url = await uploadDataUrl(file.name, file.type, reader.result as string);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      }),
    [uploadDataUrl],
  );

  return { uploadDataUrl, uploadFile, uploading, error };
}