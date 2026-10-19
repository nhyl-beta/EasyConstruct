// The Stakeholders section on the project page (client demo change #4): add, edit and remove the people
// outside the company this project deals with. Names and companies are visible to anyone who can see the
// project; emails and phones only to the PM and Admin (the server decides, this just shows what it sent).
import { useState } from "react";
import { Building2, Mail, Pencil, Phone, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/ui/section-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStakeholders } from "../hooks/use-stakeholders";
import type { Stakeholder } from "../repositories/stakeholder.repository";
import { StakeholderForm } from "./StakeholderForm";

export function StakeholdersPanel({ projectCode, canManage }: { projectCode: string; canManage: boolean }) {
  const { items, loading, error, saving, add, edit, remove, reload } = useStakeholders(projectCode);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Stakeholder | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const finish = (result: string | null, done: () => void) => {
    setMessage(result);
    if (!result) done();
  };

  return (
    <SectionCard
      title="Stakeholders"
      actions={
        canManage && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add stakeholder
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        The owner, contractor and others outside the company. RFIs and RFAs are sent to the people listed here.
      </p>

      {loading && <Skeleton className="h-16 w-full" />}
      {!loading && error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
          <span>Couldn't load stakeholders. {error}</span>
          <Button size="sm" variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      )}
      {!loading && !error && items.length === 0 && !adding && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> No stakeholders yet.{canManage ? " Add the project owner so RFIs can reach them." : ""}
        </div>
      )}

      {message && <p className="mb-2 text-sm text-destructive-strong">{message}</p>}

      <ul className="space-y-2">
        {items.map((s) =>
          editingId === s.id ? (
            <li key={s.id}>
              <StakeholderForm
                initial={{ name: s.name, company: s.company ?? "", role: s.role, email: s.email ?? "", phone: s.phone ?? "" }}
                submitLabel="Save"
                busy={saving}
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => finish(await edit(s.id, input), () => setEditingId(null))}
              />
            </li>
          ) : (
            <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {s.name}
                  <Badge variant="outline" className="rounded-full text-overline">
                    {s.role}
                  </Badge>
                </p>
                {s.company && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" /> {s.company}
                  </p>
                )}
                {s.contactHidden ? (
                  <p className="text-xs text-muted-foreground">Contact details are visible to the project manager and admin.</p>
                ) : (
                  <>
                    {s.email && (
                      <p className="flex items-center gap-1 break-all text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /> {s.email}
                      </p>
                    )}
                    {s.phone && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" /> {s.phone}
                      </p>
                    )}
                    {!s.email && <p className="text-xs text-warning-strong">No email, so RFIs cannot be sent to this person.</p>}
                  </>
                )}
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${s.name}`} onClick={() => setEditingId(s.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      {adding && (
        <div className="mt-3">
          <StakeholderForm busy={saving} onCancel={() => setAdding(false)} onSubmit={async (input) => finish(await add(input), () => setAdding(false))} />
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove stakeholder"
        description={removing ? `Remove ${removing.name} from this project? Requests already sent to them keep their record.` : ""}
        confirmLabel="Remove"
        destructive
        loading={saving}
        onConfirm={() => {
          if (!removing) return;
          void remove(removing.id).then((result) => finish(result, () => setRemoving(null)));
        }}
      />
    </SectionCard>
  );
}
