// Groups for the audit-trail "Module" filter, so a long flat list of entity types reads as a few headings.
// An entity type that matches no rule falls into "Other", so a new type is never lost from the list.
const RULES: { group: string; test: RegExp }[] = [
  { group: "Projects & delivery", test: /^(project|project_member|task|milestone|issue|requirement|stakeholder|plan-set|plan-suggestion)$/ },
  { group: "Design", test: /^(design|design-request|design-revision|revision|proposal|transmittal|rfi-reply|blueprint)/ },
  { group: "Workflows & approvals", test: /^(workflow|owner-approval)/ },
  { group: "Finance & payroll", test: /^(budget|payroll_batch|expense|payroll)/ },
  { group: "People & access", test: /^(user|employee|attendance|auth|support_request|role)/ },
  { group: "Documents & files", test: /^(document|document_type|file)$/ },
];

export const entityGroup = (type: string): string => RULES.find((r) => r.test.test(type))?.group ?? "Other";

/** Entity types grouped under headings, headings in rule order with "Other" last, types alphabetical inside. */
export function groupEntityTypes(types: string[]): { group: string; types: string[] }[] {
  const order = [...RULES.map((r) => r.group), "Other"];
  const byGroup = new Map<string, string[]>();
  for (const t of [...types].sort((a, b) => a.localeCompare(b))) {
    const g = entityGroup(t);
    byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
  }
  return order.filter((g) => byGroup.has(g)).map((g) => ({ group: g, types: byGroup.get(g)! }));
}
