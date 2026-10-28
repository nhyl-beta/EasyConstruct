// src/components/users/user-account-dialog.tsx
// One dialog for both create and edit.
//
// On create the password field sets the initial password. On edit it sets a
// NEW password on that account and is optional — leaving it blank saves the
// other changes and touches nothing else. Previously the field was hidden
// entirely when editing, which left IT Designer with no way to reset the
// password of an account whose owner could no longer reach the mailbox the
// self-service recovery link is sent to.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/features/roles/types/role.types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { LinkableEmployee, PublicUser } from "@/features/users/repositories/user.repository";

export interface UserAccountDialogProps {
  open: boolean;
  /** null → create a new account; a user → edit that account. */
  user: PublicUser | null;
  roles: Role[];
  /** Active employees without an account (create mode). */
  employees: LinkableEmployee[];
  employeesLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    employeeId: number;
    password: string;
    role: string;
  }) => Promise<unknown>;
  onUpdate: (
    id: number,
    input: { name: string; email: string; role: string },
  ) => Promise<unknown>;
  /** Administrative password reset — only called when the field is filled in. */
  onSetPassword: (id: number, password: string) => Promise<unknown>;
}

export function UserAccountDialog({
  open,
  user,
  roles,
  employees,
  employeesLoading = false,
  onOpenChange,
  onCreate,
  onUpdate,
  onSetPassword,
}: UserAccountDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeKey, setEmployeeKey] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog is opened programmatically and reused for a different record
  // each time, so the fields reseed on every open rather than on mount.
  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role ?? "");
    setEmployeeKey("");
    setPassword("");
    setError(null);
  }, [open, user]);

  const isEdit = user !== null;
  // A linked account's name and email follow its employee record, so they are edited there (Human Resources).
  const linkedToEmployee = isEdit && !!user.employeeCode;
  const selectedEmployee = useMemo(
    () => employees.find((e) => String(e.id) === employeeKey) ?? null,
    [employees, employeeKey],
  );
  // On edit the password is optional, but a partially typed one is refused
  // here rather than sent and bounced by the server's 10-character rule.
  const passwordValidForEdit = password === "" || password.length >= 10;
  const canSubmit = isEdit
    ? name.trim() !== "" && email.trim() !== "" && role !== "" && passwordValidForEdit
    : selectedEmployee !== null && role !== "" && password.length >= 10;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await onUpdate(user.id, {
          name: name.trim(),
          email: email.trim(),
          role,
        });
        // Separate endpoint (PATCH /users/:id/password) because the password
        // column is never read back or returned — see users/repository.ts.
        if (password) {
          await onSetPassword(user.id, password);
        }
      } else {
        await onCreate({
          employeeId: selectedEmployee!.id,
          password,
          role,
        });
      }
      onOpenChange(false);
    } catch (err) {
      // Surfaces the server's own message: employee already has an account, inactive, no email, unknown role.
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the person's details or move them to a different role."
              : "Create a sign-in for an employee and assign the role that governs what they can reach."}
          </DialogDescription>
        </DialogHeader>
        {isEdit && user.role === "owner" && (
          <p role="note" className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-strong">
            Changes to the Owner account need the Owner's approval by email. Nothing changes until the Owner approves it.
          </p>
        )}

        <div className="space-y-4 py-2">
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}

          {!isEdit && (
            <div className="grid gap-1.5">
              <Label htmlFor="user-employee">Employee</Label>
              {employees.length === 0 && !employeesLoading ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  No employees without an account. Ask HR to add the employee first.
                </p>
              ) : (
                <SearchableSelect
                  id="user-employee"
                  value={employeeKey || undefined}
                  onValueChange={setEmployeeKey}
                  disabled={saving}
                  loading={employeesLoading}
                  options={employees.map((e) => ({
                    value: String(e.id),
                    label: `${e.name} · ${e.employeeId}`,
                    description: e.role,
                  }))}
                  placeholder={employeesLoading ? "Loading employees…" : "Select an employee"}
                  searchPlaceholder="Search by name, employee ID or role…"
                  emptyText="No employees without an account. Ask HR to add the employee first."
                />
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={isEdit ? name : selectedEmployee?.name ?? ""}
              readOnly={!isEdit || linkedToEmployee}
              disabled={saving}
              placeholder={isEdit ? undefined : "Filled in from the employee"}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              autoComplete="off"
              value={isEdit ? email : selectedEmployee?.email ?? ""}
              readOnly={!isEdit || linkedToEmployee}
              disabled={saving}
              placeholder={isEdit ? undefined : "Filled in from the employee"}
              onChange={(e) => setEmail(e.target.value)}
            />
            {linkedToEmployee && (
              <p className="text-xs text-muted-foreground">
                Name and email come from the employee record ({user?.employeeCode}). Human Resources edits them there.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-password">
              {isEdit ? "Change password" : "Initial password"}
            </Label>
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? "Leave blank to keep the current password" : undefined}
              value={password}
              disabled={saving}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "At least 10 characters. Setting one here replaces the account's password immediately — use it when the person can't reach the mailbox the recovery link goes to."
                : "At least 10 characters. The person can change it later from the sign-in page's \"Forgot password\" link."}
            </p>
            {isEdit && password !== "" && password.length < 10 && (
              <p className="text-xs text-destructive-strong">
                Password must be at least 10 characters.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={setRole} disabled={saving}>
              <SelectTrigger id="user-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.name}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !canSubmit} onClick={submit}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

UserAccountDialog.displayName = "UserAccountDialog";
