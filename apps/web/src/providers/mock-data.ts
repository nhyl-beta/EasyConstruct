// src/providers/mock-data.ts
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, HardHat, TrendingUp, Wallet } from "lucide-react";

// Shared Types

export type Trend = "up" | "down" | "flat";
export type StatusTone =
  | "success"
  | "info"
  | "warning"
  | "destructive"
  | "muted";
export type RiskLevel = "Low" | "Medium" | "High";
export type ImpactLevel = "Low" | "Medium" | "High";
export type WorkflowStageStatus = "done" | "current" | "upcoming";
export type WorkflowStageIconKey =
  | "UserCheck"
  | "Wallet"
  | "ShieldCheck"
  | "FileSignature";
export type ApprovalSeverity = "high" | "medium" | "low";
export type ApprovalTab = "pending" | "mine" | "history";
export type DocumentIconKey =
  | "FileText"
  | "FileSignature"
  | "FileSpreadsheet"
  | "Image";
export type EmployeeStatus = "Active" | "On Leave" | "Suspended" | "Archived";
export type AttendanceStatus = "Verified" | "Pending" | "Flagged";
export type PayrollStatus = "Approved" | "Pending" | "Review";
export type GeofenceStatus = "Inside" | "Edge" | "Outside";
export type PhotoStatus = "Verified" | "Pending" | "Failed";
export type ToneBg = "success" | "warning" | "destructive" | "info" | "muted";

// Interfaces

export interface KPI {
  label: string;
  value: string;
  delta: string;
  trend: Trend;
  icon: LucideIcon;
  hint: string;
}

export interface Project {
  name: string;
  code: string;
  pm: string;
  status: string;
  statusTone: StatusTone;
  progress: number; // 0–100 — percentage complete
  budget: number; // 0–100+ — percentage of budget consumed
  due: string;
  risk: RiskLevel;
}

export interface AIInsight {
  title: string;
  summary: string;
  confidence: number; // 0–100
  impact: ImpactLevel;
  action: string;
}

export interface Approval {
  id: string;
  title: string;
  amount: string;
  owner: string;
  age: string;
}

export interface ActivityItem {
  who: string;
  what: string;
  when: string;
}

export interface WorkforceSummary {
  present: number;
  late: number;
  absent: number;
}

export interface SiteAdvisory {
  title: string;
  message: string;
}

export interface WorkflowTemplate {
  name: string;
  desc: string;
  stages: number;
  avg: string;
  active: number;
}

export interface WorkflowStage {
  role: string;
  icon: LucideIcon;
  status: WorkflowStageStatus;
  who: string;
  when: string;
}

export interface WorkflowStageData {
  role: string;
  iconKey: WorkflowStageIconKey;
  status: WorkflowStageStatus;
  who: string;
  when: string;
}

export interface ActiveWorkflow {
  id: string;
  title: string;
  project: string;
  amount: string;
  template: string;
  pipeline: WorkflowStage[];
}

export interface ActiveWorkflowData {
  id: string;
  title: string;
  project: string;
  amount: string;
  template: string;
  pipeline: WorkflowStageData[];
}

export interface WorkflowAISuggestion {
  title: string;
  desc: string;
}

export interface ApprovalItem {
  id: string;
  title: string;
  project: string;
  type: string;
  amount: string;
  owner: string;
  age: string;
  severity: ApprovalSeverity;
  aiNote: string;
}

export interface ApprovalStat {
  label: string;
  value: string;
  tone: string;
}

export interface DocumentFolder {
  name: string;
  count: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  project: string;
  type: string;
  version: string;
  size: string;
  updated: string;
  by: string;
  iconKey: DocumentIconKey;
}

export interface Employee {
  id:             string;
  name:           string;
  initials:       string;
  role:           string;
  department:     string;
  site:           string;
  status:         EmployeeStatus;
  attendanceRate: number;
  performance:    number;
  hiredOn:        string;
}

export interface AttendanceLog {
  empId:    string;
  name:     string;
  initials: string;
  site:     string;
  clockIn:  string;
  clockOut: string;
  hours:    number;
  geofence: GeofenceStatus;
  photo:    PhotoStatus;
  status:   AttendanceStatus;
}

export interface PayrollRow {
  empId:      string;
  name:       string;
  initials:   string;
  role:       string;
  hours:      number;
  overtime:   number;
  gross:      number;
  deductions: number;
  net:        number;
  status:     PayrollStatus;
}

export interface Department {
  name:  string;
  count: number;
  color: string; // tailwind bg class
}

export interface AttendanceDay {
  day:     string;
  present: number;
  late:    number;
  absent:  number;
}

export interface HRAIInsight {
  title:      string;
  detail:     string;
  confidence: number; // 0–1
  impact:     string;
  action:     string;
}

export interface HRActivityItem {
  text: string;
  time: string;
  tone: ToneBg;
}

export interface WorkforceSite {
  name:      string;
  assigned:  number;
  capacity:  number;
  available: number;
  ot:        number;
}

export interface HRReport {
  title: string;
  desc:  string;
  tag:   string;
}

export interface HRNotification {
  title: string;
  time:  string;
  tone:  ToneBg;
}

// Dashboard — KPIs

export const dashboardKPIs: KPI[] = [
  {
    label: "Active projects",
    value: "24",
    delta: "+3 this month",
    trend: "up",
    icon: TrendingUp,
    hint: "vs. last quarter",
  },
  {
    label: "On-time milestones",
    value: "87%",
    delta: "+4.2%",
    trend: "up",
    icon: CheckCircle2,
    hint: "rolling 30d",
  },
  {
    label: "Budget utilization",
    value: "$12.4M",
    delta: "62% of plan",
    trend: "flat",
    icon: Wallet,
    hint: "across portfolio",
  },
  {
    label: "Workforce on site",
    value: "342",
    delta: "-12 vs. yesterday",
    trend: "down",
    icon: HardHat,
    hint: "9 sites",
  },
];

// Dashboard — Projects

export const activeProjects: Project[] = [
  {
    name: "Westgate Medical Tower",
    code: "WMT-204",
    pm: "M. Rivera",
    status: "In Progress",
    statusTone: "info",
    progress: 68,
    budget: 92,
    due: "Aug 14",
    risk: "Low",
  },
  {
    name: "Harbor Logistics Hub",
    code: "HLH-118",
    pm: "T. Okafor",
    status: "Delayed",
    statusTone: "destructive",
    progress: 41,
    budget: 104,
    due: "Jun 30",
    risk: "High",
  },
  {
    name: "Riverside Civic Center",
    code: "RCC-077",
    pm: "S. Aquino",
    status: "Under Review",
    statusTone: "warning",
    progress: 55,
    budget: 71,
    due: "Sep 02",
    risk: "Medium",
  },
  {
    name: "North Ridge Terminal 2",
    code: "NRT-330",
    pm: "K. Singh",
    status: "On Track",
    statusTone: "success",
    progress: 82,
    budget: 78,
    due: "Jul 21",
    risk: "Low",
  },
  {
    name: "Eastfield Solar Farm",
    code: "ESF-051",
    pm: "L. Park",
    status: "Planning",
    statusTone: "muted",
    progress: 12,
    budget: 18,
    due: "Nov 10",
    risk: "Low",
  },
];

// Dashboard — AI Insights

export const aiInsights: AIInsight[] = [
  {
    title: "Schedule slip risk on HLH-118",
    summary:
      "Concrete pour dependencies for Block C show a 9-day projected slip based on supplier lead times and weather.",
    confidence: 86,
    impact: "High",
    action: "Re-sequence Block C pour",
  },
  {
    title: "Proposal P-2041 ready for review",
    summary:
      "Validated against scope, pricing band, and 3 historical comparables. Two clauses flagged for legal.",
    confidence: 92,
    impact: "Medium",
    action: "Open validation report",
  },
  {
    title: "Crew reallocation opportunity",
    summary:
      "Shifting 6 electricians from RCC-077 (week 14) to NRT-330 saves ~$48k without milestone impact.",
    confidence: 74,
    impact: "Medium",
    action: "Simulate reallocation",
  },
];

// Dashboard — Pending Approvals

export const pendingApprovals: Approval[] = [
  {
    id: "PR-2041",
    title: "Subcontractor proposal — Steel erection",
    amount: "$1.24M",
    owner: "Finance",
    age: "2d",
  },
  {
    id: "CO-118",
    title: "Change order — Block C foundations",
    amount: "$182k",
    owner: "Engineering",
    age: "1d",
  },
  {
    id: "TS-009",
    title: "Timesheet exception — Crew 14",
    amount: "48 hrs",
    owner: "HR",
    age: "4h",
  },
  {
    id: "DR-302",
    title: "Drawing revision — Curtain wall",
    amount: "Rev. C",
    owner: "Architect",
    age: "6h",
  },
];

// Dashboard — Activity Timeline

export const activityTimeline: ActivityItem[] = [
  {
    who: "T. Okafor",
    what: "uploaded RFI-208 to Harbor Logistics Hub",
    when: "12m",
  },
  {
    who: "AI Assistant",
    what: "flagged margin variance on PR-2041",
    when: "38m",
  },
  { who: "S. Aquino", what: "moved 'Roof framing' to Completed", when: "1h" },
  { who: "K. Singh", what: "approved timesheet batch #228", when: "2h" },
  { who: "L. Park", what: "drafted proposal P-2052", when: "3h" },
];

// Dashboard — Workforce Summary

export const workforceSummary: WorkforceSummary = {
  present: 298,
  late: 31,
  absent: 13,
};

// Dashboard — Site Advisories

export const siteAdvisories: SiteAdvisory[] = [
  {
    title: "Weather advisory",
    message:
      "Heavy rain expected at Harbor & Riverside sites Thursday. Consider rescheduling exterior pours.",
  },
];

// Workflows — Templates

export const workflowTemplates: WorkflowTemplate[] = [
  {
    name: "Standard procurement",
    desc: "PM review → Finance → Executive sign-off. Default for purchase orders over $50k.",
    stages: 3,
    avg: "1.8 days",
    active: 14,
  },
  {
    name: "Change order — fast track",
    desc: "Skip mid-tier review for change orders under $25k impact.",
    stages: 2,
    avg: "0.6 days",
    active: 8,
  },
  {
    name: "Public works compliance",
    desc: "Adds Compliance and Legal nodes for public-sector projects.",
    stages: 5,
    avg: "4.2 days",
    active: 3,
  },
  {
    name: "Subcontractor onboarding",
    desc: "HR verification, insurance check, safety review, PM approval.",
    stages: 4,
    avg: "2.4 days",
    active: 6,
  },
];

// Workflows — Active Pipeline

export const activeWorkflows: ActiveWorkflowData[] = [
  {
    id: "PR-2041",
    title: "Steel erection proposal",
    project: "Westgate Medical Tower",
    amount: "$1.24M",
    template: "standard procurement",
    pipeline: [
      {
        role: "Project Manager",
        iconKey: "UserCheck",
        status: "done",
        who: "Maya Rivera",
        when: "Mon",
      },
      {
        role: "Finance",
        iconKey: "Wallet",
        status: "done",
        who: "Lena Park",
        when: "Tue",
      },
      {
        role: "Compliance",
        iconKey: "ShieldCheck",
        status: "current",
        who: "Jordan Wells",
        when: "Today",
      },
      {
        role: "Executive",
        iconKey: "FileSignature",
        status: "upcoming",
        who: "TBD",
        when: "—",
      },
    ],
  },
];

// Workflows — AI Suggestions

export const workflowAISuggestions: WorkflowAISuggestion[] = [
  {
    title: "Add parallel Compliance & Legal review",
    desc: "Sequential review is adding ~1.4 days to public-works contracts. Parallelizing has historically reduced cycle time by 38% without quality regressions.",
  },
  {
    title: "Auto-escalate stale approvals after 48h",
    desc: "12 approvals stalled >48h this month. Auto-escalation to the deputy approver would have unblocked 9 of 12.",
  },
  {
    title: "Merge timesheet exceptions into a daily batch",
    desc: "Reduces HR-side notifications by 84% while preserving SLA compliance.",
  },
];

// Approvals — Items

export const approvalStats: ApprovalStat[] = [
  { label: "Pending", value: "12", tone: "text-foreground" },
  { label: "Overdue", value: "3", tone: "text-destructive-strong" },
  { label: "Avg cycle", value: "1.6d", tone: "text-foreground" },
  { label: "This week", value: "47", tone: "text-foreground" },
];

export const approvalItems: ApprovalItem[] = [
  {
    id: "PR-2041",
    title: "Steel erection — subcontractor proposal",
    project: "Westgate Medical Tower",
    type: "Proposal",
    amount: "$1.24M",
    owner: "Finance",
    age: "2d",
    severity: "high",
    aiNote:
      "Pricing within historical band. Two clauses flagged for legal review.",
  },
  {
    id: "CO-118",
    title: "Change order — Block C foundations",
    project: "Harbor Logistics Hub",
    type: "Change order",
    amount: "$182k",
    owner: "Engineering",
    age: "1d",
    severity: "medium",
    aiNote: "Cost impact 4.3% of category budget. Schedule impact: +6 days.",
  },
  {
    id: "TS-009",
    title: "Timesheet exception — Crew 14",
    project: "Riverside Civic Center",
    type: "Timesheet",
    amount: "48 hrs",
    owner: "HR",
    age: "4h",
    severity: "low",
    aiNote: "Pattern matches prior approved overtime. Safe to bulk-approve.",
  },
  {
    id: "DR-302",
    title: "Drawing revision — Curtain wall Rev C",
    project: "Westgate Medical Tower",
    type: "Drawing",
    amount: "Rev. C",
    owner: "Architect",
    age: "6h",
    severity: "medium",
    aiNote: "12 sheets updated. Conflicts with MEP coordination on level 9.",
  },
  {
    id: "PR-2052",
    title: "Solar PV inverter package",
    project: "Eastfield Solar Farm",
    type: "Proposal",
    amount: "$612k",
    owner: "Finance",
    age: "3h",
    severity: "low",
    aiNote: "Vendor previously approved on ESF-051. No flags.",
  },
];

//Documents — Folders
export const documentFolders: DocumentFolder[] = [
  { name: "Contracts", count: 142 },
  { name: "Drawings", count: 1284 },
  { name: "Proposals", count: 318 },
  { name: "RFIs & Submittals", count: 642 },
  { name: "Permits & Compliance", count: 96 },
  { name: "Reports", count: 207 },
];

export const documentItems: DocumentItem[] = [
  {
    id: "DR-302",
    title: "Curtain wall — Rev C",
    project: "WMT-204",
    type: "Drawing",
    version: "v3",
    size: "12.4 MB",
    updated: "2h ago",
    by: "P. Anand",
    iconKey: "Image",
  },
  {
    id: "PR-2041",
    title: "Steel erection proposal",
    project: "WMT-204",
    type: "Proposal",
    version: "v2",
    size: "1.8 MB",
    updated: "1d ago",
    by: "L. Park",
    iconKey: "FileText",
  },
  {
    id: "CT-014",
    title: "MEP subcontract",
    project: "WMT-204",
    type: "Contract",
    version: "v1",
    size: "884 KB",
    updated: "3d ago",
    by: "Legal",
    iconKey: "FileSignature",
  },
  {
    id: "RP-208",
    title: "Geotechnical investigation",
    project: "HLH-118",
    type: "Report",
    version: "v1",
    size: "6.2 MB",
    updated: "1w ago",
    by: "GeoCon Ltd.",
    iconKey: "FileText",
  },
  {
    id: "BD-051",
    title: "Cost forecast Q3",
    project: "Portfolio",
    type: "Spreadsheet",
    version: "v4",
    size: "412 KB",
    updated: "2w ago",
    by: "Finance",
    iconKey: "FileSpreadsheet",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Employees
// ─────────────────────────────────────────────────────────────────────────────

export const employees: Employee[] = [
  { id: "EMP-001", name: "Adaeze Nwosu",    initials: "AN", role: "Site Engineer",       department: "Engineering",    site: "Westgate Tower",  status: "Active",    attendanceRate: 97, performance: 4.6, hiredOn: "Jan 2022" },
  { id: "EMP-002", name: "Marcus Bell",     initials: "MB", role: "Field Supervisor",    department: "Field Ops",      site: "Harborline Hub",  status: "Active",    attendanceRate: 88, performance: 3.9, hiredOn: "Mar 2021" },
  { id: "EMP-003", name: "Lena Park",       initials: "LP", role: "Finance Analyst",     department: "Finance",        site: "HQ",              status: "Active",    attendanceRate: 99, performance: 4.8, hiredOn: "Jun 2020" },
  { id: "EMP-004", name: "Jordan Wells",    initials: "JW", role: "Compliance Officer",  department: "Legal",          site: "HQ",              status: "On Leave",  attendanceRate: 91, performance: 4.2, hiredOn: "Sep 2019" },
  { id: "EMP-005", name: "Sofia Reyes",     initials: "SR", role: "HR Coordinator",      department: "HR",             site: "HQ",              status: "Active",    attendanceRate: 95, performance: 4.4, hiredOn: "Feb 2023" },
  { id: "EMP-006", name: "Kwame Asante",    initials: "KA", role: "Structural Engineer", department: "Engineering",    site: "Northgate Plaza", status: "Active",    attendanceRate: 93, performance: 4.3, hiredOn: "Nov 2021" },
  { id: "EMP-007", name: "Priya Menon",     initials: "PM", role: "Architect",           department: "Design",         site: "Westgate Tower",  status: "Active",    attendanceRate: 96, performance: 4.7, hiredOn: "Apr 2020" },
  { id: "EMP-008", name: "Derek Santos",    initials: "DS", role: "Safety Officer",      department: "Safety",         site: "Harborline Hub",  status: "Suspended", attendanceRate: 72, performance: 2.8, hiredOn: "Jul 2022" },
  { id: "EMP-009", name: "Yuki Tanaka",     initials: "YT", role: "MEP Engineer",        department: "Engineering",    site: "Phoenix HQ",      status: "Active",    attendanceRate: 98, performance: 4.5, hiredOn: "Jan 2021" },
  { id: "EMP-010", name: "Amara Diallo",    initials: "AD", role: "Project Coordinator", department: "Project Mgmt",   site: "Northgate Plaza", status: "Active",    attendanceRate: 94, performance: 4.1, hiredOn: "Aug 2022" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Attendance Logs
// ─────────────────────────────────────────────────────────────────────────────

export const attendanceLogs: AttendanceLog[] = [
  { empId: "EMP-001", name: "Adaeze Nwosu", initials: "AN", site: "Westgate Tower",  clockIn: "06:58", clockOut: "16:02", hours: 9.1,  geofence: "Inside",  photo: "Verified", status: "Verified" },
  { empId: "EMP-002", name: "Marcus Bell",  initials: "MB", site: "Harborline Hub",  clockIn: "07:34", clockOut: "17:10", hours: 9.6,  geofence: "Outside", photo: "Failed",   status: "Flagged"  },
  { empId: "EMP-003", name: "Lena Park",    initials: "LP", site: "HQ",              clockIn: "08:01", clockOut: "17:00", hours: 8.9,  geofence: "Inside",  photo: "Verified", status: "Verified" },
  { empId: "EMP-006", name: "Kwame Asante", initials: "KA", site: "Northgate Plaza", clockIn: "07:05", clockOut: "16:30", hours: 9.4,  geofence: "Inside",  photo: "Verified", status: "Verified" },
  { empId: "EMP-007", name: "Priya Menon",  initials: "PM", site: "Westgate Tower",  clockIn: "07:55", clockOut: "17:05", hours: 9.2,  geofence: "Edge",    photo: "Pending",  status: "Pending"  },
  { empId: "EMP-009", name: "Yuki Tanaka",  initials: "YT", site: "Phoenix HQ",      clockIn: "07:00", clockOut: "16:00", hours: 9.0,  geofence: "Inside",  photo: "Verified", status: "Verified" },
  { empId: "EMP-010", name: "Amara Diallo", initials: "AD", site: "Northgate Plaza", clockIn: "08:10", clockOut: "17:15", hours: 9.1,  geofence: "Inside",  photo: "Verified", status: "Verified" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Payroll Rows
// ─────────────────────────────────────────────────────────────────────────────

export const payrollRows: PayrollRow[] = [
  { empId: "EMP-001", name: "Adaeze Nwosu", initials: "AN", role: "Site Engineer",       hours: 80, overtime: 6,  gross: 6800,  deductions: 1020, net: 5780,  status: "Approved" },
  { empId: "EMP-002", name: "Marcus Bell",  initials: "MB", role: "Field Supervisor",    hours: 88, overtime: 8,  gross: 7200,  deductions: 1080, net: 6120,  status: "Review"   },
  { empId: "EMP-003", name: "Lena Park",    initials: "LP", role: "Finance Analyst",     hours: 80, overtime: 0,  gross: 8400,  deductions: 1260, net: 7140,  status: "Approved" },
  { empId: "EMP-006", name: "Kwame Asante", initials: "KA", role: "Structural Engineer", hours: 80, overtime: 4,  gross: 7600,  deductions: 1140, net: 6460,  status: "Pending"  },
  { empId: "EMP-007", name: "Priya Menon",  initials: "PM", role: "Architect",           hours: 80, overtime: 2,  gross: 9200,  deductions: 1380, net: 7820,  status: "Approved" },
  { empId: "EMP-009", name: "Yuki Tanaka",  initials: "YT", role: "MEP Engineer",        hours: 80, overtime: 10, gross: 7400,  deductions: 1110, net: 6290,  status: "Pending"  },
  { empId: "EMP-010", name: "Amara Diallo", initials: "AD", role: "Project Coordinator", hours: 80, overtime: 0,  gross: 5800,  deductions: 870,  net: 4930,  status: "Approved" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Departments
// ─────────────────────────────────────────────────────────────────────────────

export const departments: Department[] = [
  { name: "Engineering",  count: 148, color: "bg-primary"        },
  { name: "Field Ops",    count: 124, color: "bg-info"           },
  { name: "Finance",      count: 42,  color: "bg-success"        },
  { name: "HR",           count: 28,  color: "bg-warning"        },
  { name: "Legal",        count: 18,  color: "bg-destructive"    },
  { name: "Design",       count: 56,  color: "bg-ai"             },
  { name: "Safety",       count: 38,  color: "bg-secondary"      },
  { name: "Project Mgmt", count: 64,  color: "bg-muted-foreground"},
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Weekly Attendance Chart
// ─────────────────────────────────────────────────────────────────────────────

export const attendanceWeek: AttendanceDay[] = [
  { day: "Mon", present: 468, late: 22, absent: 28 },
  { day: "Tue", present: 471, late: 18, absent: 29 },
  { day: "Wed", present: 458, late: 31, absent: 29 },
  { day: "Thu", present: 445, late: 28, absent: 45 },
  { day: "Fri", present: 436, late: 24, absent: 58 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — AI Insights
// ─────────────────────────────────────────────────────────────────────────────

export const hrAIInsights: HRAIInsight[] = [
  {
    title:      "Overtime risk — Field Ops",
    detail:     "Crew 14 has logged >12h OT this week. Fatigue risk rises significantly above 10h sustained.",
    confidence: 0.88,
    impact:     "Safety + cost",
    action:     "Rebalance crew",
  },
  {
    title:      "Attendance anomaly — Harborline",
    detail:     "Late arrivals at Harborline increased 34% this week. Correlates with transit disruption reports.",
    confidence: 0.76,
    impact:     "Schedule",
    action:     "Notify supervisors",
  },
  {
    title:      "Payroll exception pattern",
    detail:     "3 recurring exceptions from the same crew suggest a timesheet configuration issue.",
    confidence: 0.91,
    impact:     "Compliance",
    action:     "Review config",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Recent Activity
// ─────────────────────────────────────────────────────────────────────────────

export const hrActivity: HRActivityItem[] = [
  { text: "Adaeze Nwosu verified site attendance",    time: "6 min",  tone: "success"     },
  { text: "Geofence breach flagged — M. Bell",        time: "22 min", tone: "warning"     },
  { text: "Payroll batch B-118 sent for approval",    time: "1 hr",   tone: "info"        },
  { text: "2 new employees onboarded to Field Ops",   time: "3 hr",   tone: "muted"       },
  { text: "Document expiration — 4 certifications",   time: "Today",  tone: "warning"     },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Workforce Sites
// ─────────────────────────────────────────────────────────────────────────────

export const workforceSites: WorkforceSite[] = [
  { name: "Westgate Tower",  assigned: 142, capacity: 160, available: 18, ot: 8 },
  { name: "Harborline Hub",  assigned: 118, capacity: 130, available: 12, ot: 5 },
  { name: "Northgate Plaza", assigned: 96,  capacity: 120, available: 24, ot: 3 },
  { name: "Phoenix HQ",      assigned: 62,  capacity: 70,  available: 8,  ot: 1 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Reports
// ─────────────────────────────────────────────────────────────────────────────

export const hrReports: HRReport[] = [
  { title: "Attendance report",   desc: "Daily, weekly, monthly attendance breakdown with late-arrival analysis.",          tag: "Operations" },
  { title: "Payroll report",      desc: "Gross labor, deductions, and net payable per period with approval trail.",         tag: "Finance"    },
  { title: "Workforce report",    desc: "Capacity, allocation, and utilization across sites and departments.",              tag: "Capacity"   },
  { title: "Performance report",  desc: "Employee performance trends, ratings, and outliers.",                              tag: "People"     },
  { title: "HR analytics",        desc: "Turnover, tenure, and engagement signals with AI explainability.",                 tag: "Analytics"  },
  { title: "Executive HR brief",  desc: "C-level summary covering workforce health and labor cost trends.",                 tag: "Executive"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HR — Notifications
// ─────────────────────────────────────────────────────────────────────────────

export const hrNotifications: HRNotification[] = [
  { title: "Geofence breach — Marcus Bell",                    time: "22 min ago", tone: "warning"     },
  { title: "Payroll batch B-118 awaiting approval",            time: "1 hr ago",   tone: "info"        },
  { title: "4 certifications expiring within 14 days",         time: "Today",      tone: "warning"     },
  { title: "Workforce risk: Westgate Tower understaffed Thu",  time: "Today",      tone: "destructive" },
];
