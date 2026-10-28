// apps/web/src/components/shared/file-list-picker.tsx
//
// A small controlled "attach files" field: pick one or more files, see them
// listed, remove any. Holds File objects only — uploading happens when the
// owning form is submitted, so nothing lands in storage for a form that is
// abandoned or fails validation.
import { useRef } from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Mirrors MAX_BYTES in apps/api/src/uploads/service.ts. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

interface FileListPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  invalid?: boolean;
  /** Shown under the list, e.g. "PDF, Word, Excel or image, up to 8 MB each". */
  hint?: string;
  onError?: (message: string | null) => void;
}

export function FileListPicker({
  files,
  onChange,
  maxFiles = 10,
  disabled,
  invalid,
  hint = "PDF, Word, Excel, CAD or image files, up to 8 MB each.",
  onError,
}: FileListPickerProps) {
  const input = useRef<HTMLInputElement>(null);

  const add = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        onError?.(`${file.name} is larger than 8 MB.`);
        continue;
      }
      if (next.length >= maxFiles) {
        onError?.(`You can attach up to ${maxFiles} files.`);
        break;
      }
      next.push(file);
      onError?.(null);
    }
    onChange(next);
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-dashed p-3",
        invalid ? "border-destructive" : "border-border",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
       
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" /> Attach file
      </Button>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">{file.name}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive-strong"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-overline text-muted-foreground">{hint}</p>
    </div>
  );
}
