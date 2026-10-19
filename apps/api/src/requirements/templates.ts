// apps/api/src/requirements/templates.ts: pure, no I/O (objectives fix 3.4)
//
// Template packs for drafting a requirement: a starting point per category
// (Objectives, Materials, Constraints, Specifications) and project type, topped
// up with items triggered by keywords in the approved proposal or design.
// Everything is a prompt with a [specify ...] blank for the Engineer to fill in
// or delete; the draft is never saved by itself. The output uses the existing
// StructuredRequirement shape so the same form code handles both.
import { renderStructuredDescription, workTypeOf, type StructuredRequirement, type StructuredSection } from "./structuring.js";
import type { REQUIREMENT_CATEGORIES } from "./types.js";

type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

/** Categories that map onto a section. "Other" has no pack. */
const CATEGORY_TO_SECTION: Partial<Record<RequirementCategory, StructuredSection>> = {
  Objectives: "objectives",
  Materials: "materials",
  Constraints: "constraints",
  Specifications: "specifications",
};

export const DRAFT_CATEGORIES = Object.keys(CATEGORY_TO_SECTION) as RequirementCategory[];

type Pack = Record<StructuredSection, string[]>;

const GENERIC: Pack = {
  objectives: [
    "Purpose of the work and the outcome the client expects: [specify]",
    "Areas or elements of the project covered by this requirement: [specify]",
  ],
  materials: [
    "Principal materials and their grades: [specify]",
    "Approved equivalents and sources: [specify]",
  ],
  constraints: [
    "Target completion date or duration: [specify]",
    "Site access, working hours and noise limits: [specify]",
    "Budget ceiling for this scope: [specify]",
  ],
  specifications: [
    "Governing standard or code: [specify, e.g. NSCP / PNS]",
    "Quantity and extent of work, with units: [specify]",
    "Acceptance tests and inspection points: [specify]",
  ],
};

/** Project-type packs. Items are added after the generic ones for the same section. */
export const TYPE_PACKS: Record<string, Partial<Pack>> = {
  Commercial: {
    objectives: ["Intended use and occupancy of the building: [specify]"],
    materials: ["Facade, glazing and finishing materials: [specify]"],
    constraints: ["Fire safety, egress and accessibility compliance: [specify]", "Tenant fit-out interfaces and turnover dates: [specify]"],
    specifications: ["Gross floor area and number of storeys: [specify]", "Structural loading for the intended use: [specify, kPa]"],
  },
  Residential: {
    objectives: ["Number and type of units or rooms, and the household needs they serve: [specify]"],
    materials: ["Wall, floor and roof finishes: [specify]", "Plumbing and electrical fixtures: [specify]"],
    constraints: ["Lot boundaries, setbacks and zoning limits: [specify]", "Occupancy or move-in date: [specify]"],
    specifications: ["Lot area and floor area: [specify, sqm]", "Ceiling height and room sizes: [specify, m]"],
  },
  Infrastructure: {
    objectives: ["Service or capacity the infrastructure must provide: [specify]"],
    materials: ["Pavement, aggregate or pipe materials: [specify]", "Concrete and reinforcement grades for structures: [specify]"],
    constraints: ["Traffic management and utility relocation: [specify]", "Environmental and right-of-way permits: [specify]"],
    specifications: ["Alignment, length and design speed or flow: [specify]", "Drainage capacity and design storm: [specify]"],
  },
  Industrial: {
    objectives: ["Production process or equipment the facility must support: [specify]"],
    materials: ["Structural steel sections and floor slab grade: [specify]", "Process piping and cladding materials: [specify]"],
    constraints: ["Plant shutdown windows and hot-work permits: [specify]", "Environmental, health and safety requirements: [specify]"],
    specifications: ["Floor loading and crane or equipment loads: [specify]", "Utility capacities (power, water, compressed air): [specify]"],
  },
  "Renewable Energy": {
    objectives: ["Installed capacity and expected annual output: [specify, kW / MW]"],
    materials: ["Panels or turbine units, mounting and inverter specification: [specify]", "Cabling and protection equipment: [specify]"],
    constraints: ["Grid connection agreement and utility approval: [specify]", "Environmental clearance and land use limits: [specify]"],
    specifications: ["System capacity, voltage and grid code compliance: [specify]", "Performance ratio and commissioning tests: [specify]"],
  },
};

interface KeywordRule {
  /** Matched against the proposal and design text. */
  pattern: RegExp;
  /** Short name used in the basis line. */
  name: string;
  items: { section: StructuredSection; text: string }[];
}

export const KEYWORD_RULES: KeywordRule[] = [
  {
    pattern: /\b(?:concrete|slab|footing|foundation|rebar|cement)\b/i,
    name: "concrete",
    items: [
      { section: "materials", text: "Concrete mix and reinforcement: [specify strength, rebar size and spacing]" },
      { section: "specifications", text: "Concrete testing: [slump test and compressive-strength cylinders]" },
    ],
  },
  {
    pattern: /\b(?:steel|truss|girder|weld\w*|purlin)\b/i,
    name: "structural steel",
    items: [
      { section: "materials", text: "Steel grade and section sizes: [specify]" },
      { section: "specifications", text: "Connection, welding and protective coating requirements: [specify]" },
    ],
  },
  {
    pattern: /\b(?:roof\w*|gutter|waterproof\w*)\b/i,
    name: "roofing",
    items: [
      { section: "materials", text: "Roofing sheet type and gauge: [specify]" },
      { section: "constraints", text: "Water-tightness acceptance for the roof and openings: [specify]" },
    ],
  },
  {
    pattern: /\b(?:electric\w*|wiring|conduit|panel ?board|lighting|solar|inverter)\b/i,
    name: "electrical",
    items: [
      { section: "specifications", text: "Load and circuit ratings, and the applicable electrical code: [specify]" },
      { section: "materials", text: "Wire and cable size and type: [specify]" },
    ],
  },
  {
    pattern: /\b(?:plumb\w*|sanitary|drain\w*|septic|water supply|sewer)\b/i,
    name: "plumbing and drainage",
    items: [
      { section: "materials", text: "Pipe material and diameter: [specify]" },
      { section: "specifications", text: "Pressure or leak test and pipe slope: [specify]" },
    ],
  },
  {
    pattern: /\b(?:excavat\w*|earthwork\w*|backfill\w*|grading|compaction)\b/i,
    name: "earthworks",
    items: [
      { section: "specifications", text: "Excavation depth, extent and compaction requirement: [specify]" },
      { section: "constraints", text: "Shoring, slope protection and spoil disposal: [specify]" },
    ],
  },
  {
    pattern: /\b(?:tile\w*|paint\w*|ceiling|flooring|finish\w*)\b/i,
    name: "finishes",
    items: [
      { section: "materials", text: "Finish product, color and approved equivalents: [specify]" },
      { section: "constraints", text: "Sample approval before full installation" },
    ],
  },
  {
    pattern: /\b(?:fire|sprinkler|egress|alarm)\b/i,
    name: "fire safety",
    items: [{ section: "constraints", text: "Fire protection system and code compliance, with inspection sign-off: [specify]" }],
  },
];

export interface DraftInput {
  projectCode: string;
  projectName?: string | null;
  projectType?: string | null;
  category: string;
  /** Text of the approved proposal (title, description), if any. */
  proposalText?: string | null;
  /** Text of the project design (name, description), if any. */
  designText?: string | null;
}

export type RequirementDraft = StructuredRequirement & {
  /** What the draft was built from, in plain words. */
  basis: string[];
};

const push = (sections: Pack, section: StructuredSection, text: string) => {
  if (!sections[section].includes(text)) sections[section].push(text);
};

/** The category's section items, generic first, then the project type's. */
export const packFor = (category: string, projectType: string | null | undefined): string[] => {
  const section = CATEGORY_TO_SECTION[category as RequirementCategory];
  if (!section) return [];
  const typePack = projectType ? TYPE_PACKS[projectType]?.[section] ?? [] : [];
  return [...GENERIC[section], ...typePack];
};

export const generateDraft = (input: DraftInput): RequirementDraft => {
  const category = (input.category in CATEGORY_TO_SECTION ? input.category : "Other") as RequirementCategory;
  const sections: Pack = { objectives: [], materials: [], constraints: [], specifications: [] };
  const basis: string[] = [];

  const chosen = CATEGORY_TO_SECTION[category];
  if (chosen) {
    for (const item of packFor(category, input.projectType)) push(sections, chosen, item);
    basis.push(
      `Template pack: ${category}${input.projectType ? ` for ${input.projectType} projects` : " (project type not set, generic items only)"}.`,
    );
  } else {
    basis.push("Category \"Other\" has no template pack; only keyword items are added.");
  }

  const source = [input.proposalText ?? "", input.designText ?? ""].join(" ");
  const sources = [input.proposalText ? "the approved proposal" : null, input.designText ? "the design" : null].filter(Boolean);
  if (source.trim()) {
    const found: string[] = [];
    for (const rule of KEYWORD_RULES) {
      if (!rule.pattern.test(source)) continue;
      found.push(rule.name);
      for (const item of rule.items) push(sections, item.section, item.text);
    }
    basis.push(
      found.length > 0
        ? `Keyword items added for ${found.join(", ")} found in ${sources.join(" and ")}.`
        : `No work-type keywords found in ${sources.join(" and ")}.`,
    );
  } else {
    basis.push("No approved proposal or design text to read keywords from.");
  }

  return {
    category,
    workType: workTypeOf(`${source} ${input.projectType ?? ""}`),
    sections,
    suggestions: [],
    rewrites: [],
    description: renderStructuredDescription(sections),
    basis,
  };
};
