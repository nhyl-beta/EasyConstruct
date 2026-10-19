// The stakeholders part of the New Project wizard's "Team & stakeholders" step (client demo change #4).
// The project does not exist yet, so these are kept in the form and sent with the create request.
import { useState } from "react";
import { Building2, Mail, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StakeholderInput } from "../repositories/stakeholder.repository";
import { StakeholderForm } from "./StakeholderForm";

export function StakeholderDraftEditor({
  value,
  onChange,
  ownerHint,
}: {
  value: StakeholderInput[];
  onChange: (next: StakeholderInput[]) => void;
  /** The client entered on the first step; it becomes the Owner automatically when no Owner is listed. */
  ownerHint?: string;
}) {
  const [adding, setAdding] = useState(value.length === 0);
  const hasOwner = value.some((s) => s.role === "Owner");

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Stakeholders</h4>
        <p className="text-xs text-muted-foreground">
          The owner, contractor and others outside the company. RFIs and RFAs are sent to them.
          {!hasOwner && ownerHint ? ` "${ownerHint}" (the client from the first step) will be added as the Owner.` : ""}
        </p>
      </div>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3">
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
                {s.email && (
                  <p className="flex items-center gap-1 break-all text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" /> {s.email}
                  </p>
                )}
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${s.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <StakeholderForm
          onCancel={value.length > 0 ? () => setAdding(false) : undefined}
          onSubmit={(input) => {
            onChange([...value, input]);
            setAdding(false);
          }}
        />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          Add another stakeholder
        </Button>
      )}
    </div>
  );
}
