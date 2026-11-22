// apps/web/src/features/proposals/lib/supporting-file-types.ts
//
// What a proposal's supporting file actually is, construction-wise — shown as
// a document type instead of a bare filename, so a reviewer knows what kind
// of proof they're looking at before opening it.
export const SUPPORTING_FILE_TYPES = [
  "Quotation",
  "Bill of Quantities (BOQ)",
  "Cost Estimate",
  "Material Price Reference",
  "Structural Computation",
  "Permit / Compliance Document",
  "Other",
] as const;

export type SupportingFileType = (typeof SUPPORTING_FILE_TYPES)[number];
