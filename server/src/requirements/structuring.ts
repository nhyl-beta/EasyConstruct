// server/src/requirements/structuring.ts
//
// Pure, no I/O (same shape as ai-validation/matcher.ts). Rule-based
// "structure with AI": splits a rough engineer note into clauses, routes each
// to Objectives / Materials / Constraints / Specifications, rewrites a short
// list of vague phrases (always reported, never silent) and suggests commonly
// required elements that the text does not already mention. Deterministic;
// no model call.
import type { REQUIREMENT_CATEGORIES } from "./types.js";

type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export type StructuredSection = "objectives" | "materials" | "constraints" | "specifications";

export interface StructuredSuggestion {
  section: StructuredSection;
  text: string;
  reason: string;
}

export interface StructuredRewrite {
  from: string;
  to: string;
}

export interface StructuredRequirement {
  category: RequirementCategory;
  workType: string;
  sections: Record<StructuredSection, string[]>;
  suggestions: StructuredSuggestion[];
  rewrites: StructuredRewrite[];
  description: string;
}

export interface StructureInput {
  text: string;
  title?: string;
  projectType?: string;
  category?: string;
}

export const SECTION_HEADINGS: Record<StructuredSection, string> = {
  objectives: "Objectives",
  materials: "Materials",
  constraints: "Constraints",
  specifications: "Specifications",
};

const SECTION_ORDER: StructuredSection[] = ["objectives", "materials", "constraints", "specifications"];

// --- vague phrase rewrites --------------------------------------------------

const CONFORMING = "conforming to applicable project standards and approved specifications";

const REWRITE_RULES: { pattern: RegExp; to: string }[] = [
  // "good quality gravel" -> "gravel conforming to ..." (keeps the noun in front).
  { pattern: /\b(?:good|high) quality ([a-z][a-z-]*)\b/gi, to: `$1 ${CONFORMING}` },
  { pattern: /\b(?:good|high) quality\b/gi, to: CONFORMING },
  { pattern: /\bas soon as possible\b/gi, to: "to be completed per the approved schedule" },
  { pattern: /\basap\b/gi, to: "to be completed per the approved schedule" },
  { pattern: /\ba lot of\b/gi, to: "a sufficient quantity of (quantity to be specified)" },
  { pattern: /\bcheap\b/gi, to: "cost-effective within the approved budget" },
  { pattern: /\bnice finish\b/gi, to: "finish conforming to the approved finishes schedule" },
  { pattern: /\b(?:around|about|roughly)\b/gi, to: "approximately" },
  { pattern: /\bsqm\b/gi, to: "m²" },
];

// --- clause routing ---------------------------------------------------------

const INTENT = /^\s*(?:we\s+)?(?:need|needs|want|wants|require|requires|build|construct|install|provide|to\s|purpose|goal|aim|ensure|objective)/i;
const CONSTRAINT =
  /\b(?:must|shall|should not|must not|not exceed|no more than|at most|at least|maximum|minimum|within|deadline|before|no later than|until|limit(?:ed)?|only|avoid|prohibit(?:ed)?|restricted|budget|weeks?|days?|months?|schedule|completed per)\b/i;
const SPECIFICATION =
  /\b\d+(?:[.,]\d+)?\s?(?:mm|cm|m|m²|m2|m³|m3|sqm|cum|kg|kn|mpa|psi|pcs|pieces|units?|%|in|inch(?:es)?|ft|feet|liters?|l)(?![a-z0-9])|\b(?:grade|class|astm|pns|nscp|aci|aisc|iso|spec(?:ification)?s?|dimension|thick(?:ness)?|diameter|rating)\b/i;
const MATERIAL =
  /\b(?:concrete|cement|rebar|reinforc\w*|steel|gravel|sand|aggregate|lumber|plywood|brick|chb|block|tile|paint|pipe|pvc|wire|cable|conduit|asphalt|gypsum|roofing|insulation|mortar|grout|glass|timber|bolt|fastener|formwork|waterproofing|admixture|fill)\b/i;

const splitClauses = (text: string): string[] =>
  text
    .split(/[\n\r]+|[.;!?]+(?:\s|$)|,\s+(?![^()]*\))|\s+and\s+(?=(?:the|a|an|use|provide|ensure|install)\b)/i)
    // Only list markers ("- ", "* ", "1. ", "2)") are stripped, never a leading quantity.
    .map((c) => c.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim())
    .filter((c) => c.length > 1);

const tidy = (clause: string): string => {
  const trimmed = clause.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const routeClause = (clause: string): StructuredSection => {
  if (INTENT.test(clause)) return "objectives";
  if (CONSTRAINT.test(clause)) return "constraints";
  if (SPECIFICATION.test(clause)) return "specifications";
  if (MATERIAL.test(clause)) return "materials";
  return "objectives"; // unrouted clauses are never dropped
};

// --- work-type templates ----------------------------------------------------

interface TemplateElement {
  section: StructuredSection;
  text: string;
  reason: string;
  /** If this matches the text the element is already covered. */
  present: RegExp;
}

interface WorkTemplate {
  type: string;
  detect: RegExp;
  elements: TemplateElement[];
}

const TEMPLATES: WorkTemplate[] = [
  {
    type: "concrete",
    detect: /\b(?:concrete|slab|footing|foundation|column|beam|pour(?:ing)?|rebar|cement)\b/i,
    elements: [
      { section: "specifications", text: "Concrete strength grade: [specify, e.g. 21 MPa / 3000 psi]", reason: "Concrete work normally states a design strength", present: /\b\d+\s?mpa\b|\bpsi\b|\bgrade\b|\bclass [a-d]\b|\bc\d{2}\b|\bf'?c\b/i },
      { section: "specifications", text: "Slab/member thickness: [specify, mm]", reason: "Thickness drives quantity and structural capacity", present: /\bthick(?:ness)?\b|\bdepth\b|\b\d+\s?(?:mm|cm|in|inch(?:es)?)\b/i },
      { section: "constraints", text: "Curing period: [specify, e.g. 7 days moist curing]", reason: "Curing duration affects schedule and final strength", present: /\bcur(?:e|ed|ing)\b/i },
      { section: "materials", text: "Reinforcement: [bar size, spacing, grade, or wire mesh]", reason: "Reinforcement is normally specified with structural concrete", present: /\brebar\b|\breinforc\w*\b|\bmesh\b/i },
      { section: "specifications", text: "Quality testing: [slump test and compressive-strength cylinders]", reason: "Concrete is normally accepted on slump and strength testing", present: /\bslump\b|\bcylinder\b|\bcompressive\b|\btest(?:s|ing)?\b/i },
    ],
  },
  {
    type: "masonry",
    detect: /\b(?:masonry|chb|hollow block|brick|wall|plaster)\b/i,
    elements: [
      { section: "materials", text: "Block/brick size and strength class: [specify]", reason: "Masonry units are specified by size and class", present: /\b\d+\s?(?:mm|inch|in)\b|\bclass\b|\bgrade\b/i },
      { section: "specifications", text: "Mortar mix and joint thickness: [specify]", reason: "Mortar proportions and joint size affect wall strength", present: /\bmortar\b|\bjoint\b|\bmix\b/i },
      { section: "specifications", text: "Wall reinforcement and tie details: [bar size, spacing]", reason: "Masonry walls are normally reinforced and tied to the frame", present: /\brebar\b|\breinforc\w*\b|\btie\b/i },
    ],
  },
  {
    type: "roofing",
    detect: /\b(?:roof|roofing|truss|purlin|gutter|rafter)\b/i,
    elements: [
      { section: "materials", text: "Roofing sheet type and gauge: [specify]", reason: "Roofing material and thickness must be stated", present: /\bgauge\b|\bthick(?:ness)?\b|\bsheet\b|\btile\b/i },
      { section: "specifications", text: "Roof slope and drainage: [specify]", reason: "Slope and drainage prevent ponding and leaks", present: /\bslope\b|\bpitch\b|\bdrain\w*\b|\bgutter\b/i },
      { section: "constraints", text: "Weatherproofing / waterproofing requirement: [specify]", reason: "Roof work is normally accepted on water-tightness", present: /\bwaterproof\w*\b|\bweather\w*\b|\bleak\w*\b/i },
    ],
  },
  {
    type: "electrical",
    detect: /\b(?:electrical|wiring|wire|cable|conduit|panel|breaker|circuit|lighting|outlet)\b/i,
    elements: [
      { section: "specifications", text: "Load and circuit ratings: [specify, A / V]", reason: "Electrical work is sized on load and rating", present: /\b\d+\s?(?:a|amps?|v|volts?|kw|kva)\b|\bload\b|\brating\b/i },
      { section: "materials", text: "Wire/cable size and type: [specify]", reason: "Conductor size and insulation type must be stated", present: /\bawg\b|\bmm²|\bmm2\b|\bthhn\b|\bcable type\b|\bsize\b/i },
      { section: "specifications", text: "Applicable code: [e.g. Philippine Electrical Code]", reason: "Electrical installations are accepted against a code", present: /\bcode\b|\bpec\b|\bstandard\b/i },
    ],
  },
  {
    type: "plumbing",
    detect: /\b(?:plumbing|pipe|pvc|drain\w*|water supply|sewer|septic|fixture|valve)\b/i,
    elements: [
      { section: "materials", text: "Pipe material and diameter: [specify]", reason: "Pipe material and size must be stated", present: /\bdiameter\b|\b\d+\s?(?:mm|inch|in)\b|\bpvc\b|\bppr\b/i },
      { section: "specifications", text: "Pressure / leak test: [specify test pressure and duration]", reason: "Plumbing is normally accepted on a pressure test", present: /\bpressure\b|\bleak\b|\btest(?:s|ing)?\b/i },
      { section: "specifications", text: "Pipe slope and venting: [specify]", reason: "Drain lines need slope and venting", present: /\bslope\b|\bvent\w*\b/i },
    ],
  },
  {
    type: "earthworks",
    detect: /\b(?:excavat\w*|earthwork\w*|backfill\w*|grading|compaction|trench\w*|embankment|soil)\b/i,
    elements: [
      { section: "specifications", text: "Excavation depth and extent: [specify]", reason: "Earthworks quantities depend on depth and extent", present: /\bdepth\b|\b\d+\s?(?:m|mm|cm)\b/i },
      { section: "specifications", text: "Compaction requirement: [e.g. 95% modified Proctor]", reason: "Backfill is accepted on a compaction percentage", present: /\bcompact\w*\b|\bproctor\b/i },
      { section: "constraints", text: "Shoring / slope protection and spoil disposal: [specify]", reason: "Excavations need safety and disposal provisions", present: /\bshor\w*\b|\bdispos\w*\b|\bspoil\b/i },
    ],
  },
  {
    type: "steel",
    detect: /\b(?:steel|structural steel|weld\w*|girder|truss|i-beam|h-beam|angle bar)\b/i,
    elements: [
      { section: "materials", text: "Steel grade and section sizes: [specify]", reason: "Steel members are specified by grade and section", present: /\bgrade\b|\bastm\b|\ba36\b|\bsection\b|\b\d+\s?x\s?\d+\b/i },
      { section: "specifications", text: "Connection and welding requirements: [specify]", reason: "Connections govern steel structure integrity", present: /\bweld\w*\b|\bbolt\w*\b|\bconnection\b/i },
      { section: "specifications", text: "Protective coating: [primer / galvanizing]", reason: "Steel is normally coated against corrosion", present: /\bcoat\w*\b|\bprimer\b|\bgalvani\w*\b|\bpaint\b/i },
    ],
  },
  {
    type: "finishes",
    detect: /\b(?:paint\w*|tile\w*|tiling|ceiling|flooring|finish\w*|plaster\w*|cladding)\b/i,
    elements: [
      { section: "materials", text: "Finish product, color and brand/equivalent: [specify]", reason: "Finishes are chosen from an approved schedule", present: /\bcolor\b|\bcolour\b|\bbrand\b|\bequivalent\b/i },
      { section: "specifications", text: "Surface preparation and number of coats/layers: [specify]", reason: "Finish quality depends on preparation and coats", present: /\bcoats?\b|\blayers?\b|\bpreparation\b|\bprimer\b/i },
      { section: "constraints", text: "Sample approval before full installation", reason: "Finishes are normally approved from a sample", present: /\bsample\b|\bmock-?up\b/i },
    ],
  },
];

const GENERAL_TEMPLATE: WorkTemplate = {
  type: "general",
  detect: /./,
  elements: [
    { section: "specifications", text: "Governing standard or code: [specify, e.g. NSCP / PNS]", reason: "Requirements are normally tied to a governing standard", present: /\bnscp\b|\bpns\b|\baci\b|\bastm\b|\bcode\b|\bstandard\b/i },
  ],
};

// Appended to every work type (after the type-specific ones).
const COMMON_ELEMENTS: TemplateElement[] = [
  { section: "constraints", text: "Target completion date / duration: [specify]", reason: "A requirement should state when it must be met", present: /\bdeadline\b|\bwithin\b|\bweeks?\b|\bdays?\b|\bmonths?\b|\bschedule\b|\bcompletion\b/i },
  { section: "specifications", text: "Quantity / extent of work: [specify with unit]", reason: "Quantity lets the requirement be verified and costed", present: /\b\d+(?:[.,]\d+)?\s?(?:m²|m2|m³|m3|sqm|cum|m|mm|cm|kg|pcs|pieces|units?|lm|ft|sq\.?\s?m)\b/i },
];

const detectTemplate = (haystack: string): WorkTemplate =>
  TEMPLATES.find((t) => t.detect.test(haystack)) ?? GENERAL_TEMPLATE;

/** The work type a block of text reads as (concrete, masonry...), or "general". Used by the draft generator. */
export const workTypeOf = (haystack: string): string => detectTemplate(haystack).type;

// --- category ---------------------------------------------------------------

const CATEGORY_TIE_ORDER: StructuredSection[] = ["specifications", "materials", "constraints", "objectives"];
const SECTION_TO_CATEGORY: Record<StructuredSection, RequirementCategory> = {
  specifications: "Specifications",
  materials: "Materials",
  constraints: "Constraints",
  objectives: "Objectives",
};

const pickCategory = (sections: Record<StructuredSection, string[]>): RequirementCategory => {
  let best: StructuredSection | null = null;
  for (const s of CATEGORY_TIE_ORDER) {
    if (sections[s].length === 0) continue;
    if (!best || sections[s].length > sections[best].length) best = s;
  }
  return best ? SECTION_TO_CATEGORY[best] : "Other";
};

// --- rendering --------------------------------------------------------------

/** The one standard format: fixed headings, bullet per item, "—" when empty. */
export const renderStructuredDescription = (sections: Record<StructuredSection, string[]>): string =>
  SECTION_ORDER.map((s) => {
    const items = sections[s];
    const body = items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none stated)";
    return `${SECTION_HEADINGS[s]}\n${body}`;
  }).join("\n\n");

// --- entry point ------------------------------------------------------------

export const structureRequirement = (input: StructureInput): StructuredRequirement => {
  const original = (input.text ?? "").trim();
  const rewrites: StructuredRewrite[] = [];

  // Rewrites are applied per clause and every change is listed once. Routing
  // uses the ORIGINAL clause, so a reworded phrase (e.g. "approved schedule")
  // can never pull a clause into a different section.
  const rewriteClause = (clause: string): string => {
    let out = clause;
    for (const rule of REWRITE_RULES) {
      out = out.replace(rule.pattern, (match: string, ...groups: unknown[]) => {
        const to = rule.to.replace(/\$(\d)/g, (_m, n: string) => String(groups[Number(n) - 1] ?? ""));
        if (!rewrites.some((r) => r.from.toLowerCase() === match.toLowerCase())) {
          rewrites.push({ from: match, to });
        }
        return to;
      });
    }
    return out;
  };

  const sections: Record<StructuredSection, string[]> = {
    objectives: [],
    materials: [],
    constraints: [],
    specifications: [],
  };
  const rewrittenClauses: string[] = [];
  for (const clause of splitClauses(original)) {
    const section = routeClause(clause);
    const reworded = rewriteClause(clause);
    rewrittenClauses.push(reworded);
    const item = tidy(reworded);
    if (!sections[section].includes(item)) sections[section].push(item);
  }
  const working = rewrittenClauses.join(" ");

  const haystack = [original, input.title ?? "", input.projectType ?? ""].join(" ");
  const template = detectTemplate(haystack);
  // "Already present" is judged against the rewritten text so a suggestion
  // isn't offered for something the engineer did write.
  const coverage = `${original} ${working} ${input.title ?? ""}`;
  const suggestions: StructuredSuggestion[] = [];
  for (const el of [...template.elements, ...GENERAL_TEMPLATE.elements, ...COMMON_ELEMENTS]) {
    if (el.present.test(coverage)) continue;
    if (suggestions.some((s) => s.text === el.text)) continue;
    suggestions.push({ section: el.section, text: el.text, reason: el.reason });
  }

  return {
    category: pickCategory(sections),
    workType: template.type,
    sections,
    suggestions,
    rewrites,
    description: renderStructuredDescription(sections),
  };
};
