// "Link to employee": ties an existing account (one that predates the strict link) to an Active employee that has no account.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { LinkableEmployee, PublicUser } from "@/features/users/repositories/user.repository";

interface LinkEmployeeDialogProps {
  user: PublicUser | null;
  employees: LinkableEmployee[];
  employeesLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (userId: number, employeeId: number) => Promise<unknown>;
}

export function LinkEmployeeDialog({ user, employees, employeesLoading = false, onOpenChange, onLink }: LinkEmployeeDialogProps) {
  const [employeeKey, setEmployeeKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setEmployeeKey("");
    setError(null);
  }, [user]);

  const submit = async () => {
    if (!user || !employeeKey) return;
    setSaving(true);
    setError(null);
    try {
      await onLink(user.id, Number(employeeKey));
      onOpenChange(false);
    } catch (err) {
      // The server's reason: already linked, inactive, no email, or the emails differ.
      setError(err instanceof Error ? err.message : "Couldn't link the account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to employee</DialogTitle>
          <DialogDescription>
            {user ? `Choose the employee record that belongs to ${user.name} (${user.email}). Their email must match the account's.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="link-employee">Employee</Label>
            {employees.length === 0 && !employeesLoading ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                No employees without an account. Ask HR to add the employee first, or use "Create employee from this account".
              </p>
            ) : (
              <SearchableSelect
                id="link-employee"
                value={employeeKey || undefined}
                onValueChange={setEmployeeKey}
                disabled={saving}
                loading={employeesLoading}
                options={employees.map((e) => ({
                  value: String(e.id),
                  label: `${e.name} · ${e.employeeId}`,
                  description: e.email,
                }))}
                placeholder={employeesLoading ? "Loading employees…" : "Select an employee"}
                searchPlaceholder="Search by name, employee ID or email…"
                emptyText="No matching employee"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !employeeKey} onClick={() => void submit()}>
            {saving ? "Linking…" : "Link account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

LinkEmployeeDialog.displayName = "LinkEmployeeDialog";
