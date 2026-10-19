// apps/web/src/components/shared/project-picker.tsx — NEW
//
// Root-causes a real, demonstrated bug: several forms across the app took a
// free-text "project code" string with no validation, so a typo silently
// produced a record that would never match a real project in any
// project-scoped query. This replaces free text with a picker backed by the
// same `/api/projects` list every other project-aware feature already uses.
//
// Each option carries the client as well as the code and name. A project code
// on its own ("WMT-204") identifies nothing to a Finance Manager opening a
// budget against it; the client is how the commercial side of the business
// refers to the same engagement.
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useProjects } from "@/features/projects/hooks/useProjects";

interface ProjectPickerProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When set, only these project codes are offered (e.g. the ones the user is staffed on). */
  allowedCodes?: string[];
}

export function ProjectPicker({
  value,
  onChange,
  placeholder = "Select a project",
  className,
  disabled,
  allowedCodes,
}: ProjectPickerProps) {
  const { projects, loading } = useProjects();

  // Type-to-search over code, name and client, sorted by code — a portfolio
  // outgrows a plain dropdown quickly.
  return (
    <SearchableSelect
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
      loading={loading}
      className={className}
      options={projects
        .filter((p) => !allowedCodes || allowedCodes.includes(p.code))
        .map((p) => ({
        value: p.code,
        label: `${p.code} · ${p.name}`,
        description: p.client && p.client !== "Unknown" ? p.client : undefined,
        }))}
      placeholder={loading ? "Loading projects…" : placeholder}
      searchPlaceholder="Search by code, name or client…"
      emptyText="No projects on file"
    />
  );
}
