import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DELIVERY_TYPES, PROJECT_TYPES, RISK_LEVELS } from "../types/project.types";
import type { ProjectFilterState } from "../hooks/useProjectsPaged";

// Lifecycle phases (apps/api/src/lifecycle/phases.ts), in pipeline order.
const STATUSES = [
  "Proposal",
  "Design",
  "Pre-Construction",
  "Construction",
  "Closeout",
  "Completed",
  "On Hold",
  "Cancelled",
  "Archived",
];

/** Categorical filters that sit next to the search box. */
export const ProjectsFilters: React.FC<{
  filters: ProjectFilterState;
  onChange: (key: keyof ProjectFilterState, value: string) => void;
  onClear: () => void;
  active: boolean;
}> = ({ filters, onChange, onClear, active }) => (
  <>
    <Select value={filters.projectType} onValueChange={(v) => onChange("projectType", v)}>
      <SelectTrigger aria-label="Filter by project type" className="h-9 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All types</SelectItem>
        {PROJECT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Select value={filters.deliveryType} onValueChange={(v) => onChange("deliveryType", v)}>
      <SelectTrigger aria-label="Filter by delivery type" className="h-9 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All deliveries</SelectItem>
        {DELIVERY_TYPES.map((t) => (
          <SelectItem key={t} value={t}>{t === "Design" ? "Design only" : "Construction"}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Select value={filters.status} onValueChange={(v) => onChange("status", v)}>
      <SelectTrigger aria-label="Filter by status" className="h-9 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Select value={filters.risk} onValueChange={(v) => onChange("risk", v)}>
      <SelectTrigger aria-label="Filter by risk" className="h-9 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All risk levels</SelectItem>
        {RISK_LEVELS.map((r) => (
          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    {active && (
      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    )}
  </>
);
