// server/src/plan-suggestion/templates.ts (objectives fix 3.1)
//
// Project-type templates for the suggested plan. They are starting points a
// Project Manager edits, not estimates for a real job: durations are typical
// calendar days for a mid-size ORRA-style job and are labelled as such in the
// plan's basis. Project types mirror PROJECT_TYPES in validators/project-validator.ts.

export interface TemplateTask {
  title: string;
  priority: "Low" | "Medium" | "High";
}

export interface TemplateMilestone {
  key: string;
  title: string;
  description: string;
  /** Typical calendar days this milestone takes. */
  durationDays: number;
  tasks: TemplateTask[];
}

export interface PlanTemplate {
  key: string;
  label: string;
  /** Where the durations come from, quoted in the plan's basis. */
  durationSource: string;
  milestones: TemplateMilestone[];
}

const DURATION_SOURCE = "typical calendar-day durations for this project type (template, not a quote)";

const mobilization: TemplateMilestone = {
  key: "mobilization",
  title: "Site mobilization",
  description: "Set up the site, temporary facilities, safety signage and the crew.",
  durationDays: 14,
  tasks: [
    { title: "Mobilize crew and equipment to site", priority: "High" },
    { title: "Set up temporary facilities and site fencing", priority: "Medium" },
    { title: "Conduct safety orientation and toolbox briefing", priority: "High" },
  ],
};

const turnover: TemplateMilestone = {
  key: "turnover",
  title: "Punch list and turnover",
  description: "Close out defects, final inspection and handover documents.",
  durationDays: 21,
  tasks: [
    { title: "Walk the site and compile the punch list", priority: "High" },
    { title: "Correct punch list items", priority: "Medium" },
    { title: "Prepare as-built drawings and turnover documents", priority: "Medium" },
  ],
};

export const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  Commercial: {
    key: "Commercial",
    label: "Commercial building",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "earthworks",
        title: "Earthworks and foundation",
        description: "Excavation, backfill and foundation works.",
        durationDays: 45,
        tasks: [
          { title: "Excavate and prepare the foundation bed", priority: "High" },
          { title: "Place rebar and formwork for footings", priority: "High" },
          { title: "Pour and cure foundation concrete", priority: "High" },
        ],
      },
      {
        key: "structure",
        title: "Structural frame",
        description: "Columns, beams and slabs up to roof level.",
        durationDays: 90,
        tasks: [
          { title: "Erect columns and beams", priority: "High" },
          { title: "Pour elevated slabs", priority: "High" },
          { title: "Install structural steel and roof framing", priority: "Medium" },
        ],
      },
      {
        key: "envelope-mep",
        title: "Envelope and MEP rough-in",
        description: "Walls, roofing, and electrical, plumbing and mechanical rough-in.",
        durationDays: 75,
        tasks: [
          { title: "Build masonry walls and install roofing", priority: "Medium" },
          { title: "Rough-in electrical conduit and wiring", priority: "Medium" },
          { title: "Rough-in plumbing and drainage lines", priority: "Medium" },
        ],
      },
      {
        key: "finishes",
        title: "Interior finishes",
        description: "Ceilings, flooring, painting and fixtures.",
        durationDays: 60,
        tasks: [
          { title: "Install ceilings and flooring", priority: "Medium" },
          { title: "Paint interior and exterior surfaces", priority: "Low" },
          { title: "Install fixtures, doors and windows", priority: "Medium" },
        ],
      },
      turnover,
    ],
  },
  Residential: {
    key: "Residential",
    label: "Residential building",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "foundation",
        title: "Foundation and slab",
        description: "Footings, foundation walls and ground slab.",
        durationDays: 30,
        tasks: [
          { title: "Lay out and excavate footings", priority: "High" },
          { title: "Place rebar and pour footings", priority: "High" },
          { title: "Pour ground floor slab", priority: "High" },
        ],
      },
      {
        key: "shell",
        title: "Structure and roof",
        description: "Columns, walls and roof structure.",
        durationDays: 60,
        tasks: [
          { title: "Erect columns and masonry walls", priority: "High" },
          { title: "Cast second floor slab and beams", priority: "High" },
          { title: "Install roof framing and roofing", priority: "Medium" },
        ],
      },
      {
        key: "rough-in",
        title: "Rough-in works",
        description: "Electrical, plumbing and plastering.",
        durationDays: 35,
        tasks: [
          { title: "Rough-in electrical wiring and conduit", priority: "Medium" },
          { title: "Rough-in plumbing and drainage", priority: "Medium" },
          { title: "Plaster walls", priority: "Medium" },
        ],
      },
      {
        key: "finishes",
        title: "Finishes and fixtures",
        description: "Tiling, painting, doors, windows and fixtures.",
        durationDays: 40,
        tasks: [
          { title: "Install floor and wall tiles", priority: "Medium" },
          { title: "Paint walls and ceilings", priority: "Low" },
          { title: "Install doors, windows and fixtures", priority: "Medium" },
        ],
      },
      turnover,
    ],
  },
  Infrastructure: {
    key: "Infrastructure",
    label: "Infrastructure works",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "survey-clearing",
        title: "Survey, clearing and earthworks",
        description: "Staking, site clearing, excavation and grading.",
        durationDays: 45,
        tasks: [
          { title: "Survey and stake the alignment", priority: "High" },
          { title: "Clear and grub the right-of-way", priority: "Medium" },
          { title: "Excavate, haul and grade earthworks", priority: "High" },
        ],
      },
      {
        key: "drainage-utilities",
        title: "Drainage and utilities",
        description: "Culverts, drainage lines and utility crossings.",
        durationDays: 60,
        tasks: [
          { title: "Install culverts and drainage pipes", priority: "High" },
          { title: "Relocate and protect utility lines", priority: "Medium" },
          { title: "Backfill and compact trenches", priority: "Medium" },
        ],
      },
      {
        key: "pavement-structures",
        title: "Pavement and structures",
        description: "Base course, pavement, retaining and concrete structures.",
        durationDays: 90,
        tasks: [
          { title: "Place and compact base course", priority: "High" },
          { title: "Pour concrete structures and retaining walls", priority: "High" },
          { title: "Lay pavement surface", priority: "High" },
        ],
      },
      turnover,
    ],
  },
  Industrial: {
    key: "Industrial",
    label: "Industrial facility",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "foundations",
        title: "Foundations and equipment pads",
        description: "Footings, slab on grade and equipment pads.",
        durationDays: 45,
        tasks: [
          { title: "Excavate and compact the building pad", priority: "High" },
          { title: "Pour footings and equipment pads", priority: "High" },
          { title: "Pour slab on grade", priority: "High" },
        ],
      },
      {
        key: "steel-structure",
        title: "Steel structure and roofing",
        description: "Steel erection, roof and wall cladding.",
        durationDays: 75,
        tasks: [
          { title: "Fabricate and deliver structural steel", priority: "High" },
          { title: "Erect steel frame and bracing", priority: "High" },
          { title: "Install roof and wall cladding", priority: "Medium" },
        ],
      },
      {
        key: "services",
        title: "Process and building services",
        description: "Electrical, piping and utilities for the facility.",
        durationDays: 60,
        tasks: [
          { title: "Install main electrical distribution", priority: "High" },
          { title: "Install process and utility piping", priority: "Medium" },
          { title: "Test and commission services", priority: "High" },
        ],
      },
      turnover,
    ],
  },
  "Renewable Energy": {
    key: "Renewable Energy",
    label: "Renewable energy installation",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "site-prep",
        title: "Site preparation and foundations",
        description: "Grading, access roads and mounting or turbine foundations.",
        durationDays: 40,
        tasks: [
          { title: "Grade the site and build access roads", priority: "High" },
          { title: "Install mounting or turbine foundations", priority: "High" },
          { title: "Lay trenches and conduit for cabling", priority: "Medium" },
        ],
      },
      {
        key: "equipment",
        title: "Equipment installation",
        description: "Mounting structures, panels or turbines, and inverters.",
        durationDays: 60,
        tasks: [
          { title: "Install mounting structures or tower sections", priority: "High" },
          { title: "Install panels or turbine units", priority: "High" },
          { title: "Install inverters and combiner boxes", priority: "Medium" },
        ],
      },
      {
        key: "grid-commissioning",
        title: "Grid connection and commissioning",
        description: "Cabling, grid tie-in, testing and commissioning.",
        durationDays: 35,
        tasks: [
          { title: "Pull and terminate power cabling", priority: "High" },
          { title: "Complete grid tie-in works", priority: "High" },
          { title: "Test and commission the system", priority: "High" },
        ],
      },
      turnover,
    ],
  },
  Design: {
    key: "Design",
    label: "Design-only engagement",
    durationSource: DURATION_SOURCE,
    milestones: [
      {
        key: "schematic",
        title: "Schematic design",
        description: "Concept layouts and design direction for client review.",
        durationDays: 21,
        tasks: [
          { title: "Prepare concept layouts", priority: "High" },
          { title: "Review concept with the client", priority: "Medium" },
        ],
      },
      {
        key: "design-development",
        title: "Design development",
        description: "Developed plans, sections and discipline coordination.",
        durationDays: 35,
        tasks: [
          { title: "Develop plans, elevations and sections", priority: "High" },
          { title: "Coordinate structural and MEP drawings", priority: "Medium" },
        ],
      },
      {
        key: "plan-set",
        title: "Final plan set and turnover",
        description: "Finalized drawings issued to the client.",
        durationDays: 28,
        tasks: [
          { title: "Finalize drawings and specifications", priority: "High" },
          { title: "Issue the plan set for turnover", priority: "Medium" },
        ],
      },
    ],
  },
  General: {
    key: "General",
    label: "General construction",
    durationSource: DURATION_SOURCE,
    milestones: [
      mobilization,
      {
        key: "substructure",
        title: "Site works and substructure",
        description: "Earthworks and foundations.",
        durationDays: 40,
        tasks: [
          { title: "Complete earthworks and excavation", priority: "High" },
          { title: "Build foundations", priority: "High" },
        ],
      },
      {
        key: "superstructure",
        title: "Superstructure",
        description: "Structural frame, walls and roof.",
        durationDays: 70,
        tasks: [
          { title: "Erect the structural frame", priority: "High" },
          { title: "Build walls and install the roof", priority: "Medium" },
        ],
      },
      {
        key: "services-finishes",
        title: "Services and finishes",
        description: "Building services and interior and exterior finishes.",
        durationDays: 60,
        tasks: [
          { title: "Install electrical and plumbing services", priority: "Medium" },
          { title: "Complete finishes and fixtures", priority: "Medium" },
        ],
      },
      turnover,
    ],
  },
};

// ── Responsibilities ──────────────────────────────────────────────────────

export interface ResponsibilityRow {
  phase: string;
  role: string;
  roleLabel: string;
  duty: string;
}

/** Constant table of role -> duty per phase. Shown as a checklist; it grants no permission. */
export const RESPONSIBILITIES: ResponsibilityRow[] = [
  { phase: "Pre-Construction", role: "project-manager", roleLabel: "Project Manager", duty: "Activate the milestones, confirm the schedule and issue the Notice to Proceed" },
  { phase: "Pre-Construction", role: "architect", roleLabel: "Architect", duty: "Issue approved drawings and answer design clarifications (RFI/RFA)" },
  { phase: "Pre-Construction", role: "engineer", roleLabel: "Engineer", duty: "Confirm requirements and plan the work packages into tasks" },
  { phase: "Pre-Construction", role: "consultant", roleLabel: "Consultant", duty: "Advise on technical risks before work starts" },
  { phase: "Pre-Construction", role: "finance-manager", roleLabel: "Finance", duty: "Approve the project budget and set up cost tracking" },
  { phase: "Pre-Construction", role: "human-resources", roleLabel: "HR", duty: "Confirm the crew's employee records and pay rates are in place" },
  { phase: "Pre-Construction", role: "site-personnel", roleLabel: "Site Personnel", duty: "Report for mobilization and complete safety orientation" },
  { phase: "Construction", role: "project-manager", roleLabel: "Project Manager", duty: "Track milestones and decide on issues and change requests" },
  { phase: "Construction", role: "architect", roleLabel: "Architect", duty: "Respond to requests for information and review revisions" },
  { phase: "Construction", role: "engineer", roleLabel: "Engineer", duty: "Supervise progress, inspect work and report issues" },
  { phase: "Construction", role: "consultant", roleLabel: "Consultant", duty: "Review changes that affect cost, schedule or quality" },
  { phase: "Construction", role: "finance-manager", roleLabel: "Finance", duty: "Review expenses and payroll against the budget" },
  { phase: "Construction", role: "human-resources", roleLabel: "HR", duty: "Verify attendance and prepare payroll each period" },
  { phase: "Construction", role: "site-personnel", roleLabel: "Site Personnel", duty: "Clock in daily and update assigned tasks with completion notes" },
  { phase: "Closeout", role: "project-manager", roleLabel: "Project Manager", duty: "Close open issues and tasks and start the closeout approval" },
  { phase: "Closeout", role: "finance-manager", roleLabel: "Finance", duty: "Resolve pending expenses and sign off the final accounts" },
  { phase: "Closeout", role: "engineer", roleLabel: "Engineer", duty: "Complete the final inspection and turnover documents" },
];
