import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthShell } from "@/components/ui/auth/auth-shell";
import { PasswordInput } from "@/components/ui/auth/password-input";
import { AuthSecurityNotice } from "@/components/ui/auth/auth-security-notice";
// FLAG: same collision as forgot-password.tsx — confirm real path.
import { useResetPasswordController } from "@/hooks/use-auth-controllers";

const requirements = [
  "At least 10 characters",
  "One uppercase letter",
  "One number",
];

export default function ResetPasswordPage() {
  useEffect(() => {
    document.title = "Set a new password | EasyConstruct";
  }, []);

  const { status, errors, submit } = useResetPasswordController();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const busy = status === "loading";

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardHeader className="space-y-1.5">
          <CardTitle className="font-display text-2xl tracking-tight">
            Set a new password
          </CardTitle>
          <CardDescription>
            Choose a strong password for your EasyConstruct account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {status === "success" ? (
            <Alert role="status" className="border-success/40 text-success-strong">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <AlertDescription>
                Your password has been updated. You can now sign in.
              </AlertDescription>
            </Alert>
          ) : (
            <form
              noValidate
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(password, confirmPassword);
              }}
            >
              {errors.form && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>{errors.form}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  placeholder="Enter a new password"
                  value={password}
                  disabled={busy}
                  invalid={!!errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-requirements"
                />
                {errors.password && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive-strong">
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  placeholder="Re-enter the new password"
                  value={confirmPassword}
                  disabled={busy}
                  invalid={!!errors.confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {errors.confirmPassword && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive-strong">
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              <ul
                id="password-requirements"
                className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
              >
                {requirements.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>

              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Updating password...
                  </>
                ) : (
                  "Reset password"
                )}
              </Button>
            </form>
          )}

          <AuthSecurityNotice />

          <Button asChild variant="ghost" className="w-full">
            <Link to="/login">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Return to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}