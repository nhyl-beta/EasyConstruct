import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthShell } from "@/components/ui/auth/auth-shell";
import { AuthSecurityNotice } from "@/components/ui/auth/auth-security-notice";

// FLAG: original path was "@/app/controllers/auth/useLoginController" — not
// part of the canonical structure. Needs the real path from the existing
// auth implementation; placeholder left below.

import { useForgotPasswordController } from "@/hooks/use-auth-controllers";
import { AUTH_MESSAGES } from "@/config/auth-message";

export default function ForgotPasswordPage() {
  useEffect(() => {
    document.title = "Reset access | EasyConstruct";
  }, []);

  const { status, error, submit } = useForgotPasswordController();
  const [email, setEmail] = useState("");
  const busy = status === "loading";

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardHeader className="space-y-1.5">
          <CardTitle className="font-display text-2xl tracking-tight">
            Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter your work email and we will send reset instructions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {status === "success" ? (
            <Alert role="status" className="border-success/40 text-success-strong">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <AlertDescription>{AUTH_MESSAGES.resetSent}</AlertDescription>
            </Alert>
          ) : (
            <form
              noValidate
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(email);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email address</Label>
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    className="h-11 pl-9"
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!error || undefined}
                    aria-describedby={error ? "reset-email-error" : undefined}
                  />
                </div>
                {error && (
                  <p id="reset-email-error" role="alert" className="flex items-center gap-1.5 text-xs text-destructive-strong">
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Sending reset link...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          )}

          <AuthSecurityNotice />

          <Button asChild variant="ghost" className="w-full">
            <Link to="/login">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}