import { uploadsRepository } from "@/features/uploads/repositories/uploads.repository";
import type { ReceiptAttachment } from "../types/purchasing.types";

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

/** Stores one file through POST /api/uploads (the same path requirements use). */
export async function uploadReceipt(file: File): Promise<ReceiptAttachment> {
  const res = await uploadsRepository.upload(file.name, file.type || "application/octet-stream", await readAsDataUrl(file));
  return {
    url: res.data.url,
    filename: res.data.filename,
    contentType: res.data.contentType,
    sizeBytes: res.data.sizeBytes,
  };
}
