// The small badge next to a file link: Verified, Unverified or Damaged (client demo change #2).
import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isRealFileUrl } from "@/lib/file-url";
import { useFileIntegrity } from "../hooks/use-file-integrity";
import { setIntegrity } from "../lib/integrity-store";
import { integrityRepository, type FileIntegrityStatus } from "../repositories/uploads.repository";

const LOOK: Record<FileIntegrityStatus, { label: string; className: string; title: string; Icon: typeof ShieldCheck }> = {
  verified: {
    label: "Verified",
    className: "border-success/30 bg-success/10 text-success-strong",
    title: "The file matches the fingerprint taken when it was uploaded.",
    Icon: ShieldCheck,
  },
  unverified: {
    label: "Unverified",
    className: "border-border bg-muted/50 text-muted-foreground",
    title: "No fingerprint was taken at upload, so this file cannot be checked against its original.",
    Icon: ShieldQuestion,
  },
  damaged: {
    label: "Damaged",
    className: "border-destructive/30 bg-destructive/10 text-destructive-strong",
    title: "The file no longer matches the fingerprint taken at upload. It may have been changed or corrupted.",
    Icon: ShieldAlert,
  },
};

/** Runs the server-side check and shows the result. Used by the "Check file" button. */
export function useCheckFile(url: string | null | undefined) {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    if (!url) return;
    setChecking(true);
    try {
      const result = await integrityRepository.check(url);
      setIntegrity(url, result.status);
      if (result.status === "verified") toast.success("File checked: it matches the original.");
      else if (result.status === "damaged") toast.error("This file does not match the original. Admin and IT Designer have been told.");
      else toast.message("This file has no fingerprint on record, so it cannot be checked against its original.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check the file");
    } finally {
      setChecking(false);
    }
  };
  return { check, checking };
}

export function FileIntegrityBadge({ url, withCheck = false, className }: { url: string | null | undefined; withCheck?: boolean; className?: string }) {
  const status = useFileIntegrity(isRealFileUrl(url) ? url : null);
  const { check, checking } = useCheckFile(url);
  if (!isRealFileUrl(url) || !status) return null;
  const { label, className: tone, title, Icon } = LOOK[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className ?? ""}`}>
      <Badge variant="outline" title={title} className={`gap-1 rounded-full text-overline ${tone}`}>
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </Badge>
      {withCheck && (
        <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={checking} onClick={() => void check()}>
          {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Check file"}
        </Button>
      )}
    </span>
  );
}
