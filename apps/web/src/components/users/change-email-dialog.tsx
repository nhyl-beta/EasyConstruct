// IT Designer: change the email an account signs in with (usually answering an "Email change" support request).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicUser } from "@/features/users/repositories/user.repository";

interface ChangeEmailDialogProps {
  user: PublicUser | null;
  onOpenChange: (open: boolean) => void;
  onChange: (userId: number, email: string) => Promise<unknown>;
}

export function ChangeEmailDialog({ user, onOpenChange, onChange }: ChangeEmailDialogProps) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setEmail("");
    setError(null);
  }, [user]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(user.id, email.trim());
      onOpenChange(false);
    } catch (err) {
      // The server's reason: not a valid address, already in use, or the same as today's.
      setError(err instanceof Error ? err.message : "Couldn't change the email");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            {user
              ? `${user.name} signs in with ${user.email}. The linked employee record is updated too, and they are signed out so they can sign in with the new address.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="change-email">New email</Label>
            <Input id="change-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} placeholder="name@company.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || email.trim() === ""}>
            {saving ? "Saving…" : "Change email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
