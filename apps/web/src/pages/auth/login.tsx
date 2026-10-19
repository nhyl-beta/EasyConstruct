import { AuthShell } from "@/components/ui/auth/auth-shell";
import { LoginForm } from "@/components/ui/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="sr-only">Sign in to EasyConstruct</h1>
      <LoginForm />
    </AuthShell>
  );
}