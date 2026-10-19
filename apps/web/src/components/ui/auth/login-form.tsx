import { FEATURES } from "@/config/features";
import { useState } from "react";
import { EXPIRED_NOTICE_KEY } from "@/auth/session";
import { Link } from "react-router";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/ui/auth/password-input";

import { useLoginController } from "@/hooks/use-auth-controllers";
import { AUTH_MESSAGES } from "@/config/auth-message";

export function LoginForm() {
  const { status, errors, formError, submit } = useLoginController();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  // Set by the AuthProvider when a session ended on its own (expired token,
  // or revoked by a password change) rather than by the user signing out.
  const [sessionEnded] = useState(() => {
    try {
      const flag = sessionStorage.getItem(EXPIRED_NOTICE_KEY) === "1";
      sessionStorage.removeItem(EXPIRED_NOTICE_KEY);
      return flag;
    } catch {
      return false;
    }
  });

  const busy = status === "loading" || status === "success";

  return (
    <Card className="shadow-lg">
      {/* Heading only. The card previously also carried a subtitle, a
          security reassurance panel and a "no account yet?" footer — three
          blocks of prose around two fields nobody reads on the way to
          signing in. */}
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-tight">
          Welcome back
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {sessionEnded && !formError && (
          <Alert role="status">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>
              Your session has expired. Please sign in again.
            </AlertDescription>
          </Alert>
        )}
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        {status === "success" && (
          <Alert role="status" className="border-success/40 text-success-strong">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertDescription>{AUTH_MESSAGES.success}</AlertDescription>
          </Alert>
        )}

        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ email, password, remember, tabOnly: FEATURES.multiRoleTabs });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Enter your email address"
                className="h-11 pl-9"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email || undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
            </div>
            {errors.email && (
              <p id="email-error" role="alert" className="flex items-center gap-1.5 text-xs text-destructive-strong">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              disabled={busy}
              invalid={!!errors.password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password && (
              <p id="password-error" role="alert" className="flex items-center gap-1.5 text-xs text-destructive-strong">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                {errors.password}
              </p>
            )}
            {/* Under the field it belongs to, not opposite its label. Sat on
                the label row, it read as part of the heading and was the
                first thing the eye met on the way into the password box. */}
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary-strong underline-offset-4 hover:underline focus-visible:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={remember}
              disabled={busy}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
              Keep me signed in on this device
            </Label>
          </div>

          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {status === "loading" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {AUTH_MESSAGES.loading}
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}