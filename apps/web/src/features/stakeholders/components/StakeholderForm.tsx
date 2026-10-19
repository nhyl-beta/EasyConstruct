// One stakeholder's fields, shared by the New Project wizard step and the project page (client demo change #4).
import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAKEHOLDER_ROLES, validateStakeholder, type StakeholderInput, type StakeholderRole } from "../repositories/stakeholder.repository";

const EMPTY: StakeholderInput = { name: "", company: "", role: "Owner", email: "", phone: "" };

export function StakeholderForm({
  initial,
  submitLabel = "Add",
  busy = false,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<StakeholderInput>;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (input: StakeholderInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<StakeholderInput>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof StakeholderInput, string>>>({});

  const set = <K extends keyof StakeholderInput>(key: K, value: StakeholderInput[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const found = validateStakeholder(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await onSubmit({
      name: draft.name.trim(),
      company: draft.company?.trim() || undefined,
      role: draft.role,
      email: draft.email?.trim() || undefined,
      phone: draft.phone?.trim() || undefined,
    });
    if (!initial) setDraft(EMPTY);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="sh-name">Name</Label>
          <Input id="sh-name" value={draft.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} placeholder="Contact person" />
          {errors.name && <p className="text-xs text-destructive-strong">{errors.name}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sh-company">Company</Label>
          <Input id="sh-company" value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} placeholder="Company or office" />
        </div>
        <div className="grid gap-1.5">
          <Label>Role</Label>
          <Select value={draft.role} onValueChange={(v) => set("role", v as StakeholderRole)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAKEHOLDER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sh-email">Email</Label>
          <Input id="sh-email" type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} placeholder="name@company.com" />
          {errors.email && <p className="text-xs text-destructive-strong">{errors.email}</p>}
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="sh-phone">Phone</Label>
          <Input id="sh-phone" value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
          {!initial && <Plus className="h-3.5 w-3.5" />} {submitLabel}
        </Button>
      </div>
    </div>
  );
}
