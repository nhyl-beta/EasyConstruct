import { useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiClient } from "@/services/api.client";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  className?: string;
  iconOnly?: boolean;
}

/**
 * Signing out used to happen on the first click, with no way back. The
 * icon-only variant sits in the header next to the notification bell and the
 * theme toggle, which is an easy mis-click, and unsaved work on a form is
 * gone the moment the session ends. Both variants now confirm first — the
 * same ConfirmDialog the app uses for its other irreversible actions.
 */
export function SignOutButton({ className, iconOnly = false }: SignOutButtonProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const signOut = async () => {
    setConfirming(false);
    // End the session on the server first so the token cannot be used again. If that call fails
    // (offline, server down) the person is still signed out on this device.
    try {
      await apiClient.post("/auth/logout", {});
    } catch {
      /* signing out locally is what matters here */
    }
    logout();
    navigate("/login");
  };

  return (
    <>
      {iconOnly ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          className={cn("h-8 w-8 shrink-0", className)}
          onClick={() => setConfirming(true)}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className={cn("w-full justify-start", className)}
          onClick={() => setConfirming(true)}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out of EasyConstruct?"
        description="Your session will end and any unsaved changes on this page will be lost. You'll need to sign in again to continue."
        confirmLabel="Sign out"
        onConfirm={() => void signOut()}
      />
    </>
  );
}

SignOutButton.displayName = "SignOutButton";
