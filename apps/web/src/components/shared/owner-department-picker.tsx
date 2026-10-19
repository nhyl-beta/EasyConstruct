// apps/web/src/components/shared/owner-department-picker.tsx
//
// Companion to project-picker.tsx, for the same class of bug: budget "owner /
// department" was free text, so "Structural Eng." and "Structural Engineering"
// became two different owners and no roll-up by department could ever be
// trusted.
//
// The owning party is usually one of the departments already on the employee
// roster, but it is legitimately open-ended (an external consultancy, a joint
// venture), so the real values are offered as suggestions without forbidding
// a new one. That was originally a `<datalist>`, which offers no visible
// affordance — the field reads as a plain textbox and the suggestions never
// surface — so it is now a SuggestInput with a dropdown the user can see.
import { useMemo } from "react";

import { SuggestInput } from "@/components/shared/suggest-input";
import { useEmployees } from "@/features/hr/hooks/use-hr";

interface OwnerDepartmentPickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

export function OwnerDepartmentPicker({
  value,
  onChange,
  id,
  placeholder = "Structural Engineering",
  className,
}: OwnerDepartmentPickerProps) {
  const { data: employees, loading } = useEmployees();

  // Departments first (the common case), then individual people, so the list
  // reads coarse-to-fine. Both are de-duplicated and sorted.
  const suggestions = useMemo(() => {
    const departments = new Set<string>();
    const people = new Set<string>();

    for (const employee of employees) {
      if (employee.department) departments.add(employee.department);
      if (employee.name) people.add(employee.name);
    }

    return [
      ...Array.from(departments).sort(),
      ...Array.from(people).sort(),
    ];
  }, [employees]);

  return (
    <SuggestInput
      id={id}
      value={value}
      onChange={onChange}
      suggestions={suggestions}
      placeholder={placeholder}
      loading={loading}
      className={className}
      emptyMessage="No matching department or person — the typed value will be used."
    />
  );
}

OwnerDepartmentPicker.displayName = "OwnerDepartmentPicker";
