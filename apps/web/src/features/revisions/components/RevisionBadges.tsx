import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ITEM_TYPE_LABEL, type Revision, type RevisionItemType } from "../types/revision.types";

export const RevisionStatusBadge = ({ status }: { status: Revision["status"] }) => <StatusBadge status={status} />;

export const ItemTypeBadge = ({ type }: { type: RevisionItemType }) => (
  <Badge variant="outline" className="rounded-full px-2 py-0 text-overline font-medium uppercase tracking-wide">
    {ITEM_TYPE_LABEL[type]}
  </Badge>
);

