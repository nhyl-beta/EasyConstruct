import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PROPOSAL_STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Revision Requested", label: "Revision requested" },
  { value: "Rejected", label: "Rejected" },
] as const;

/** Status dropdown shared by every proposals page (B-40); the value is what the server filter takes. */
export function ProposalStatusFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Filter by status" className="h-9 w-48 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROPOSAL_STATUS_FILTERS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
