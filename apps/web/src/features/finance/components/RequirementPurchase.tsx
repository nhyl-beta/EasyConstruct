import { useState } from "react";
import { PackageCheck, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/config/status-tone";
import { useAuth } from "@/auth/auth-context";
import type { usePurchaseRequests } from "../hooks/use-purchase-requests";
import type { useProcurement } from "../hooks/use-procurement";
import { progressLabel, purchaseProgressFor } from "../lib/purchase-progress";
import { uploadReceipt } from "../lib/upload-receipts";
import type { ProcurementOrder, PurchaseProgress } from "../types/purchasing.types";
import { DecisionDialog } from "./DecisionDialog";
import { RequestPurchaseDialog, type PurchasableRequirement } from "./RequestPurchaseDialog";

const TONE: Record<PurchaseProgress["stage"], StatusTone> = {
  none: "neutral",
  "pending-pm": "warning",
  "pending-finance": "warning",
  approved: "success",
  rejected: "danger",
  ordered: "info",
  "in-transit": "info",
  delivered: "warning",
  paid: "success",
};

export interface RequirementPurchasing {
  requests: ReturnType<typeof usePurchaseRequests>;
  orders: ReturnType<typeof useProcurement>;
}

interface Props {
  requirement: PurchasableRequirement & { status: string };
  purchasing: RequirementPurchasing;
  /** Engineer and PM may raise a request; Site Personnel only follow it. */
  canRaise: boolean;
  /** Engineer and Site Personnel (and the PM) confirm what arrives on site. */
  canReceive: boolean;
  /** Where a request goes next, for the dialog. */
  routingHint: string;
}

/**
 * A requirement's purchase, in one line: the status chip, "Request purchase"
 * when the requirement is Approved and nothing is in flight, and "Confirm
 * delivery" while its order is on the way. Every permission is also enforced
 * by the server (403 / 409); these buttons simply are not offered otherwise.
 */
export function RequirementPurchase({ requirement, purchasing, canRaise, canReceive, routingHint }: Props) {
  const { user } = useAuth();
  const [requesting, setRequesting] = useState<PurchasableRequirement | null>(null);
  const [receiving, setReceiving] = useState<ProcurementOrder | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const approved = requirement.status === "Approved";
  const progress = purchaseProgressFor(requirement.dbId, purchasing.requests.requests, purchasing.orders.orders);
  if (!approved && progress.stage === "none") return null;

  const liveOrder = purchasing.orders.orders.find(
    (o) =>
      (o.status === "ordered" || o.status === "in-transit") &&
      purchasing.requests.requests.some((r) => r.id === o.purchaseRequestId && r.requirementId === requirement.dbId),
  );
  // The person who created an order cannot confirm its delivery.
  const mayReceive = canReceive && !!liveOrder && liveOrder.createdByUserId !== user?.id;
  const canRequestAgain = approved && canRaise && (progress.stage === "none" || progress.stage === "rejected" || progress.stage === "paid");

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs text-muted-foreground">Purchase</span>
      <StatusBadge status={progressLabel(progress)} tone={TONE[progress.stage]} />
      {canRequestAgain && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRequesting(requirement)}>
          <ShoppingCart className="h-3 w-3" /> {progress.stage === "none" ? "Request purchase" : "Request again"}
        </Button>
      )}
      {mayReceive && liveOrder && (
        <Button size="sm" className="h-7 text-xs" onClick={() => { setFile(null); setReceiving(liveOrder); }}>
          <PackageCheck className="h-3 w-3" /> Confirm delivery
        </Button>
      )}

      <RequestPurchaseDialog
        requirement={requesting}
        routingHint={routingHint}
        onClose={() => setRequesting(null)}
        onSubmit={async (input) => {
          const r = await purchasing.requests.create(input);
          if (r.ok) toast.success("Purchase request sent");
          return r;
        }}
      />

      <DecisionDialog
        open={receiving !== null}
        onOpenChange={(open) => !open && setReceiving(null)}
        title={`Confirm delivery of ${receiving?.id ?? ""}`}
        description={receiving ? `${receiving.vendor}: tell Finance what arrived. They will pay the invoice next.` : undefined}
        noteLabel="Delivery note"
        confirmLabel="Confirm delivery"
        onSubmit={async (note) => {
          if (!receiving) return null;
          let receiptUrl: string | undefined;
          if (file) {
            try {
              receiptUrl = (await uploadReceipt(file)).url;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not upload the file";
            }
          }
          const r = await purchasing.orders.deliver(receiving.id, { note: note || undefined, receiptUrl });
          if (!r.ok) return r.error;
          toast.success("Delivery confirmed. Finance has been told.");
          await purchasing.requests.reload();
          return null;
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="delivery-file">Photo or delivery receipt (optional)</Label>
          <Input id="delivery-file" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </DecisionDialog>
    </div>
  );
}
