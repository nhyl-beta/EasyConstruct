import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, uploadLargeFile } from "@/features/uploads/lib/upload-file";
import type { UploadedRef } from "../types/request.types";

const ACCEPT = ".pdf,.dwg,.dxf,.rvt,.ifc,.skp,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff";

/** Upload every picked file through the shared large-file utility, in order. */
export async function uploadAll(files: File[], onProgress?: (pct: number) => void): Promise<UploadedRef[]> {
  const out: UploadedRef[] = [];
  for (const [i, f] of files.entries()) {
    const stored = await uploadLargeFile(f, (pct) => onProgress?.(Math.round(((i + pct / 100) / files.length) * 100)));
    out.push({ url: stored.url, filename: stored.filename, contentType: stored.contentType, sizeBytes: stored.sizeBytes });
  }
  return out;
}

export function RequestFilePicker({
  files,
  onChange,
  disabled,
  label = "Attachments (drawings, PDFs, DWG)",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) onChange([...files, ...picked].slice(0, 10));
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" /> Add files
        </Button>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate">
                {f.name} <span className="text-muted-foreground">({formatBytes(f.size)})</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
