import { ShieldCheck } from "lucide-react";
import { AUTH_MESSAGES } from "@/config/auth-message";

export function AuthSecurityNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden="true" />
      {AUTH_MESSAGES.security}
    </p>
  );
}
