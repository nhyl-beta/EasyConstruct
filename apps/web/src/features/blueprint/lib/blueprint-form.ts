// Field rules of the "Register a blueprint" dialog. They mirror the server's createBlueprintSchema
// (apps/api/src/validators/blueprint-validator.ts) so a form that passes here is not refused there,
// and so each message names its field instead of showing one generic line (B-205).
export interface BlueprintFormValues {
  drawingNumber: string;
  folder: string;
  title: string;
  author: string;
}

export type BlueprintFormErrors = Partial<Record<keyof BlueprintFormValues, string>>;

const RULES: { key: keyof BlueprintFormValues; label: string; min: number; max: number }[] = [
  { key: "drawingNumber", label: "Drawing number", min: 2, max: 50 },
  { key: "folder", label: "Folder", min: 1, max: 100 },
  { key: "title", label: "Title", min: 2, max: 255 },
  { key: "author", label: "Author", min: 2, max: 100 },
];

export function validateBlueprintForm(values: BlueprintFormValues): BlueprintFormErrors {
  const errors: BlueprintFormErrors = {};
  for (const r of RULES) {
    const length = values[r.key].trim().length;
    if (length === 0) errors[r.key] = `${r.label} is required`;
    else if (length < r.min) errors[r.key] = `${r.label} must be at least ${r.min} characters`;
    else if (length > r.max) errors[r.key] = `${r.label} must be at most ${r.max} characters`;
  }
  return errors;
}
