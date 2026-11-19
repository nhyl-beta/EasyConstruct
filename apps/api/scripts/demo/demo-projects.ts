import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-projects.ts
//
// Single source of truth for the seven lifecycle demo projects (DEMO-S1..S7).
// Shared by the roster generator (employee `site` values), the project seed and
// the role-data seed so every script tells the same story.
//
// Covers every lifecycle phase (one project each) and, across the 5 official
// project types in projects/validators.ts (Commercial, Residential,
// Infrastructure, Industrial, Renewable Energy), every type at least once —
// DEMO-S1 carries Renewable Energy rather than a second Commercial project.

export interface DemoProject {
  code: string;
  name: string;
  /** Lifecycle phase the project sits at (matches projects.status). */
  phase: "Proposal" | "Design" | "Pre-Construction" | "Construction" | "Closeout" | "Completed" | "Archived";
  subtitle: string;
  description: string;
  projectType: string;
  client: string;
  /** Municipality-level location only. */
  location: string;
  lat: number;
  lng: number;
  geofenceRadiusM: number;
  contractValue: number;
  plannedStartDate: string;
  due: string;
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    code: "DEMO-S1",
    name: "DEMO · 1 Proposal",
    phase: "Proposal",
    subtitle: "Malolos Rooftop Solar Array",
    description: "Rooftop solar photovoltaic installation with panel array, inverter room and grid interconnection, target capacity 2.5 MWp.",
    projectType: "Renewable Energy",
    client: "Bulacan Solar Energy Partners",
    location: "Malolos, Bulacan",
    lat: 14.8433,
    lng: 120.8114,
    geofenceRadiusM: 250,
    contractValue: 18_500_000,
    plannedStartDate: "2026-11-02",
    due: "2027-09-30",
  },
  {
    code: "DEMO-S2",
    name: "DEMO · 2 Design",
    phase: "Design",
    subtitle: "Antipolo Hillside Townhomes",
    description: "Twelve-unit hillside townhouse cluster with retaining walls and a shared driveway.",
    projectType: "Residential",
    client: "Sampaguita Homes Inc.",
    location: "Antipolo, Rizal",
    lat: 14.5864,
    lng: 121.1761,
    geofenceRadiusM: 300,
    contractValue: 42_000_000,
    plannedStartDate: "2026-09-14",
    due: "2027-12-15",
  },
  {
    code: "DEMO-S3",
    name: "DEMO · 3 Pre-Construction",
    phase: "Pre-Construction",
    subtitle: "Tanay Municipal Health Center",
    description: "Single-storey rural health unit with a birthing room, pharmacy and covered walkways.",
    projectType: "Infrastructure",
    client: "Municipal Government of Tanay",
    location: "Tanay, Rizal",
    lat: 14.4977,
    lng: 121.2855,
    geofenceRadiusM: 250,
    contractValue: 36_750_000,
    plannedStartDate: "2026-07-06",
    due: "2027-08-27",
  },
  {
    code: "DEMO-S4",
    name: "DEMO · 4 Construction",
    phase: "Construction",
    subtitle: "Pasig Retail Podium",
    description: "Four-level retail podium with a basement parking deck, structural frame in progress.",
    projectType: "Commercial",
    client: "Pasig Retail Ventures",
    location: "Pasig City, Metro Manila",
    lat: 14.5764,
    lng: 121.0851,
    geofenceRadiusM: 300,
    contractValue: 64_200_000,
    plannedStartDate: "2026-02-02",
    due: "2027-02-26",
  },
  {
    code: "DEMO-S5",
    name: "DEMO · 5 Closeout",
    phase: "Closeout",
    subtitle: "Calamba Cold-Storage Plant",
    description: "Insulated cold-storage building with a refrigeration plant room, in final inspection and turnover.",
    projectType: "Industrial",
    client: "Calamba Food Processing Corp.",
    location: "Calamba, Laguna",
    lat: 14.2117,
    lng: 121.1653,
    geofenceRadiusM: 350,
    contractValue: 28_400_000,
    plannedStartDate: "2025-09-01",
    due: "2026-10-30",
  },
  {
    code: "DEMO-S6",
    name: "DEMO · 6 Completed",
    phase: "Completed",
    subtitle: "Tagaytay Ridge Villas",
    description: "Six detached villas with landscaped grounds, handed over to the client.",
    projectType: "Residential",
    client: "Tagaytay Highlands Realty",
    location: "Tagaytay, Cavite",
    lat: 14.1153,
    lng: 120.9621,
    geofenceRadiusM: 300,
    contractValue: 22_800_000,
    plannedStartDate: "2025-03-03",
    due: "2026-04-30",
  },
  {
    code: "DEMO-S7",
    name: "DEMO · 7 Archived",
    phase: "Archived",
    subtitle: "Imus Elementary School Annex",
    description: "Four-classroom school annex, completed and archived after the warranty period.",
    projectType: "Infrastructure",
    client: "Cavite Provincial School Board",
    location: "Imus, Cavite",
    lat: 14.4297,
    lng: 120.9367,
    geofenceRadiusM: 250,
    contractValue: 15_900_000,
    plannedStartDate: "2024-06-03",
    due: "2025-05-30",
  },
];

export const DEMO_CODES = DEMO_PROJECTS.map((p) => p.code);
