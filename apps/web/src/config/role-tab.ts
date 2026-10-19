import {
  BadgeCheck,
  Layers,
  type LucideIcon,
  NotepadTextDashed,
  Plus,
  SquarePen,
  UserPlus,
} from "lucide-react";

import {
  ActivitySquare,
  BarChart2,
  CheckSquare,
  ClipboardList,
  Crown,
  DollarSign,
  FileText,
  FolderKanban,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MessageSquareQuote,
  Ruler,
  Server,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";

export type RoleTab = {
  label: string;
  icon: LucideIcon;
  route: string;
};

export type SidebarSection = {
  label: string;
  items: RoleTab[];
};

export type RoleConfig = {
  label: string;
  initials: string;
  subtitle: string;
  icon: LucideIcon;
  avatarColor: string;
  accentBg: string;
  searchPlaceholder: string;
  primaryAi: string;
  primaryAction: {
    label: string;
    icon: LucideIcon;
    route?: string;
  };
  tabs: RoleTab[];
  sections: SidebarSection[];
};

// NOTE: there is no legacy platform-admin entry — that role was merged into
// `it_designer` (renamed IT-Designer), which now carries its
// platform-administration scope on top of its own user/system administration.
export const ROLE_CONFIGS: Record<string, RoleConfig> = {
  admin: {
    label: "Admin",
    initials: "AD",
    subtitle: "System administration",
    icon: UserCheck,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Operations Intelligence",
    primaryAction: { label: "New Workflow", icon: GitBranch, route: "/admin/workflows" },

    tabs: [
      { label: "Projects", icon: FolderKanban, route: "/admin/projects" },
      { label: "Workflows", icon: GitBranch, route: "/admin/workflows" },
      { label: "Documents", icon: FileText, route: "/admin/documents" },
      { label: "Activity Logs", icon: ShieldCheck, route: "/admin/activity-logs" },
    ],

    sections: [
      {
        label: "Operations",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Projects", icon: FolderKanban, route: "/admin/projects" },
          { label: "Workflows", icon: GitBranch, route: "/admin/workflows" },
          { label: "Documents", icon: FileText, route: "/admin/documents" },
        ],
      },
      {
        label: "Monitoring",
        items: [
          { label: "Activity Logs", icon: ShieldCheck, route: "/admin/activity-logs" },
          { label: "Security", icon: ShieldAlert, route: "/admin/security" },
        ],
      },
      {
        label: "Configuration",
        items: [
          { label: "Roles & Permissions", icon: UserCheck, route: "/admin/roles-permissions" },
          { label: "Workflow Configuration", icon: GitBranch, route: "/admin/workflow-configuration" },
          { label: "Approval Hierarchy", icon: CheckSquare, route: "/admin/approval-hierarchy" },
        ],
      },
      {
        label: "Support",
        items: [{ label: "User Support", icon: LifeBuoy, route: "/admin/support" }],
      },
    ],
  },
  // Owner is admin-adjacent but read-only: the executive sees everything the
  // organization is doing and nothing that changes it, so the Configuration
  // and Support sections IT-Designer carries are deliberately absent.
  owner: {
    label: "Owner",
    initials: "OW",
    subtitle: "Executive oversight",
    icon: Crown,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Executive Intelligence",
    primaryAction: { label: "Audit Trail", icon: ShieldCheck, route: "/owner/audit-trail" },

    tabs: [
      { label: "Portfolio", icon: FolderKanban, route: "/owner/portfolio" },
      { label: "Proposals", icon: FileText, route: "/owner/proposals" },
      { label: "Audit Trail", icon: ShieldCheck, route: "/owner/audit-trail" },
      { label: "Oversight", icon: ShieldAlert, route: "/owner/oversight" },
    ],

    sections: [
      {
        label: "Executive",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Portfolio", icon: FolderKanban, route: "/owner/portfolio" },
          { label: "Proposals", icon: FileText, route: "/owner/proposals" },
        ],
      },
      {
        label: "Oversight",
        items: [
          { label: "Audit Trail", icon: ShieldCheck, route: "/owner/audit-trail" },
          { label: "System Oversight", icon: ShieldAlert, route: "/owner/oversight" },
          // The one write action Owner has — see owner-account-recovery.tsx.
          { label: "Account Recovery", icon: KeyRound, route: "/owner/account-recovery" },
        ],
      },
      {
        label: "Intelligence",
        items: [
          { label: "Reports", icon: BarChart2, route: "/reports" },
        ],
      },
    ],
  },
  // IT Designer is Admin scoped to system/user administration: it keeps the
  // Monitoring and Configuration halves of the Admin sidebar and drops the
  // Operations half (projects, workflows, documents) entirely.
  it_designer: {
    label: "IT Designer",
    initials: "IT",
    subtitle: "System administration",
    icon: Server,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "System Intelligence",
    // The header's "New User" primary action is a plain <Link>, so it can
    // only navigate — it can't call ITDesignerUsersPage's openCreate(). The
    // query param round-trips through the URL instead: the page reads it on
    // mount and opens the create-account dialog itself (see
    // it-designer-users.tsx). Was just "/it-designer/users", which — from
    // anywhere other than that page — landed on the account LIST, not the
    // create form the label promises.
    primaryAction: { label: "New User", icon: UserPlus, route: "/it-designer/users?new=1" },

    tabs: [
      { label: "Users", icon: UsersRound, route: "/it-designer/users" },
      { label: "Proposals", icon: FileText, route: "/it-designer/proposals" },
      { label: "Activity Logs", icon: ShieldCheck, route: "/it-designer/activity-logs" },
      { label: "Security", icon: ShieldAlert, route: "/it-designer/security" },
    ],

    sections: [
      {
        label: "Administration",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "User Accounts", icon: UsersRound, route: "/it-designer/users" },
          { label: "Roles & Permissions", icon: UserCheck, route: "/it-designer/roles-permissions" },
        ],
      },
      // Absorbed from the legacy platform-admin role, since renamed
      // IT-Designer: administration over projects, workflows and documents,
      // plus system configuration.
      {
        label: "Operations",
        items: [
          { label: "Projects", icon: FolderKanban, route: "/admin/projects" },
          { label: "Workflows", icon: GitBranch, route: "/admin/workflows" },
          { label: "Documents", icon: FileText, route: "/admin/documents" },
        ],
      },
      {
        label: "Configuration",
        items: [
          { label: "Workflow Configuration", icon: GitBranch, route: "/admin/workflow-configuration" },
          { label: "Approval Hierarchy", icon: CheckSquare, route: "/admin/approval-hierarchy" },
        ],
      },
      {
        label: "Monitoring",
        items: [
          { label: "Proposals", icon: FileText, route: "/it-designer/proposals" },
          { label: "Activity Logs", icon: ShieldCheck, route: "/it-designer/activity-logs" },
          { label: "Security", icon: ShieldAlert, route: "/it-designer/security" },
        ],
      },
      {
        label: "Support",
        items: [{ label: "User Support", icon: LifeBuoy, route: "/it-designer/support" }],
      },
    ],
  },
  project_manager: {
    label: "Project Manager",
    initials: "PM",
    subtitle: "Portfolio overview",
    icon: FolderKanban,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Proposal Validation",
    primaryAction: { label: "New Project", icon: Plus, route: "/projects/new" },

    tabs: [
      { label: "Projects", icon: FolderKanban, route: "/projects" },
      { label: "Workflows", icon: GitBranch, route: "/workflows" },
      { label: "Approvals", icon: CheckSquare, route: "/approvals" },
      { label: "Issues", icon: ShieldAlert, route: "/issues" },
      { label: "Tasks", icon: CheckSquare, route: "/tasks" },
      { label: "Documents", icon: FileText, route: "/documents" },
      { label: "Requests", icon: MessageSquareQuote, route: "/requests" },
    ],

    sections: [
      {
        label: "Workspace",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Projects", icon: FolderKanban, route: "/projects" },
          { label: "Workflows", icon: GitBranch, route: "/workflows" },
          { label: "Approvals", icon: CheckSquare, route: "/approvals" },
          { label: "Issues", icon: ShieldAlert, route: "/issues" },
          { label: "Tasks", icon: CheckSquare, route: "/tasks" },
          { label: "Documents", icon: FileText, route: "/documents" },
        ],
      },
      {
        label: "Intelligence",
        items: [
          { label: "Reports", icon: BarChart2, route: "/reports" },
        ],
      },
    ],
  },

  human_resources: {
    label: "Human Resources",
    initials: "HR",
    subtitle: "Workforce management",
    icon: Users,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Workforce Insights",
    primaryAction: {
      label: "Add Employee",
      icon: UserPlus,
      route: "/employees/new",
    },
    tabs: [
      { label: "Employees", icon: Users, route: "/employees" },
      { label: "Attendance", icon: UserCheck, route: "/attendance" },
      { label: "Payroll", icon: DollarSign, route: "/payroll" },
      { label: "Approvals", icon: CheckSquare, route: "/approvals" },
      { label: "Reports", icon: BarChart2, route: "/reports" },
    ],

    sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Approvals", icon: CheckSquare, route: "/approvals" },
        ],
      },
      {
        label: "People",
        items: [
          { label: "Employees", icon: UsersRound, route: "/employees" },
          { label: "Attendance", icon: UserCheck, route: "/attendance" },
          { label: "Documents", icon: FileText, route: "/documents" },
        ],
      },
      {
        label: "Payroll",
        items: [
          { label: "Payroll", icon: DollarSign, route: "/payroll" },
          { label: "Workforce Reports", icon: BarChart2, route: "/workforce-reports" },
        ],
      },
    ],
  },

  finance_manager: {
    label: "Finance Manager",
    initials: "FM",
    subtitle: "Financial overview",
    icon: DollarSign,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Impact Awareness",
    primaryAction: {
      label: "New Budget",
      icon: Plus,
      route: "/budget",
    },
    tabs: [
      { label: "Budget", icon: BarChart2, route: "/budget" },
      {
        label: "Payroll Review",
        icon: ClipboardList,
        route: "/payroll-review",
      },
      { label: "Expenses", icon: ActivitySquare, route: "/expenses" },
      { label: "Approvals", icon: CheckSquare, route: "/approvals" },
      // A2: finance-manager is an explicit ownerRole on 3 of the 5 advisory
      // signals (cost-variance, burn-vs-progress, cumulative-change-impact).
      // Before this, finance-manager had no nav path into a project's own
      // page at all — only the WaitingOnYouCard link, which only appears
      // once a signal has already fired. This lets them browse a project
      // (and its Decision Support panel) proactively, same read/write split
      // as any other non-editor role reaching /projects.
      { label: "Projects", icon: FolderKanban, route: "/projects" },
    ],

    sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
        ],
      },
      {
        label: "Budget Management",
        items: [
          { label: "Budget Overview", icon: BarChart2, route: "/budget" },
          { label: "Expenses", icon: ActivitySquare, route: "/expenses" },
          { label: "Projects", icon: FolderKanban, route: "/projects" },
        ],
      },
      {
        label: "Approvals",
        items: [
          { label: "Payroll Review", icon: ClipboardList, route: "/payroll-review" },
          { label: "Approvals", icon: CheckSquare, route: "/approvals" },
        ],
      },
    ],
  },

  architect: {
    label: "Architect",
    initials: "AR",
    subtitle: "Design & proposals",
    icon: Ruler,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "AI Validation",
    primaryAction: {
      label: "Upload Design",
      icon: Plus,
    },
    tabs: [
      { label: "Projects", icon: FolderKanban, route: "/projects" },
      { label: "Designs", icon: Ruler, route: "/designs" },
      { label: "Proposals", icon: FileText, route: "/proposals" },
      // C1: the real sidebar (providers/resources.ts, not this file's own
      // unused `sections` field — see Deviations) has always listed
      // Blueprints as a first-class Workspace item alongside Designs, but
      // no header tab's route nests "/blueprints", so navigating there
      // highlighted it in the sidebar and nothing at all in the header.
      { label: "Blueprints", icon: NotepadTextDashed, route: "/blueprints" },
      { label: "Requests", icon: MessageSquareQuote, route: "/requests" },
    ],

    sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Designs", icon: Layers, route: "/designs" },
          { label: "Blueprints", icon: NotepadTextDashed, route: "/blueprints" },
        ],
      },

      {
        label: "Collaboration",
        items: [
          { label: "Approvals", icon: CheckSquare, route: "/approvals" },
          { label: "Revisions", icon: SquarePen, route: "/revisions" },
          { label: "Documentation", icon: BarChart2, route: "/architect/documents" },
        ],
      },
    ],
  },

  engineer: {
    label: "Engineer",
    initials: "EN",
    subtitle: "Technical operations",
    icon: Wrench,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Issue Resolution",
    primaryAction: {
      label: "Report Issue",
      icon: Plus,
    },

    tabs: [
      { label: "Progress", icon: BarChart2, route: "/progress" },
      { label: "Requirements", icon: ClipboardList, route: "/requirements" },
      { label: "Approvals", icon: CheckSquare, route: "/approvals" },
      { label: "Tasks", icon: CheckSquare, route: "/tasks" },
      { label: "Projects", icon: FolderKanban, route: "/projects" },
      { label: "Issues", icon: ActivitySquare, route: "/issues" },
      { label: "Requests", icon: MessageSquareQuote, route: "/requests" },
    ],

    sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Progress & Site Reports", icon: Layers, route: "/progress" },
          {
            label: "Requirements",
            icon: NotepadTextDashed,
            route: "/requirements",
          },
          { label: "Approvals", icon: CheckSquare, route: "/approvals" },
        ],
      },

      {
        label: "Technical Operations",
        items: [
          { label: "Tasks", icon: CheckSquare, route: "/tasks" },
          { label: "Issues", icon: ActivitySquare, route: "/issues" },
          { label: "Projects", icon: FolderKanban, route: "/projects" },
          { label: "Documents", icon: FileText, route: "/documents" },
        ],
      },
    ],
  },

  site_personnel: {
    label: "Site Personnel",
    initials: "SP",
    subtitle: "Field operations",
    icon: MapPin,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Task Assistance",
    primaryAction: {
      label: "Log Attendance",
      icon: UserCheck,
    },
    tabs: [
      { label: "Attendance", icon: UserCheck, route: "/attendance" },
      { label: "Tasks", icon: CheckSquare, route: "/tasks" },
      { label: "Requirements", icon: ClipboardList, route: "/requirements" },
      { label: "Documents", icon: FileText, route: "/documents" },
      { label: "Issues", icon: ActivitySquare, route: "/issues" },
    ],

    sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          { label: "Attendance", icon: UserCheck, route: "/attendance" },
          { label: "Tasks", icon: CheckSquare, route: "/tasks" },
          {
            label: "Requirements",
            icon: NotepadTextDashed,
            route: "/requirements",
          },
        ],
      },
      {
        label: "Operations",
        items: [
          { label: "Documents", icon: FileText, route: "/documents" },
          { label: "Issues", icon: ActivitySquare, route: "/issues" },
        ],
      },
    ],
  },

  consultant: {
    label: "Consultant",
    initials: "CO",
    subtitle: "Advisory access",
    icon: UserCheck,
    avatarColor: "bg-primary-soft",
    accentBg: "bg-primary",
    searchPlaceholder: "Search or jump to… (Ctrl K)",
    primaryAi: "Proposal Analysis",
    primaryAction: {
      label: "Upload Advisory",
      icon: Plus,
      route: "/advisory-docs?new=1",
    },
      // "Approvals" used to be its own tab here, pointing at the shared
      // /approvals screen — a second place to decide on the exact same
      // workflow stages "Proposal Review" now also covers as a tab of its
      // own. Merged rather than duplicated (see consultant-proposals.tsx).
      tabs: [
        { label: "Proposal Review", icon: FileText, route: "/consultant/proposals" },
        { label: "Designs", icon: Ruler, route: "/consultant/designs" },
        { label: "Design Reviews", icon: BadgeCheck, route: "/consultant/design-reviews" },
        { label: "Blueprint Reviews", icon: NotepadTextDashed, route: "/blueprint-reviews" },
        { label: "Advisory Docs", icon: ClipboardList, route: "/advisory-docs" },
        { label: "Projects", icon: FolderKanban, route: "/consultant/projects" },
        { label: "Requests", icon: MessageSquareQuote, route: "/requests" },
      ],

        sections: [
      {
        label: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
          {
            label: "Proposal Review",
            icon: FileText,
            route: "/consultant/proposals"
          },
          { label: "Designs", icon: Ruler, route: "/consultant/designs" },
          { label: "Design Reviews", icon: BadgeCheck, route: "/consultant/design-reviews" },
          { label: "Blueprint Reviews", icon: NotepadTextDashed, route: "/blueprint-reviews" },
          { label: "Projects", icon: FolderKanban, route: "/consultant/projects" },
        ],
      },

      {
        label: "Output",
        items: [
          { label: "Advisory Docs", icon: BarChart2, route: "/advisory-docs" },
          { label: "Reports", icon: BadgeCheck, route: "/reports" },
        ],
      },
    ],
  },
};

export const DEFAULT_ROLE_CONFIG: RoleConfig = {
  label: "User",
  initials: "U",
  subtitle: "General access",
  icon: LayoutDashboard,
  avatarColor: "bg-primary-soft",
  accentBg: "bg-primary",
  searchPlaceholder: "Search or jump to… (Ctrl K)",
  primaryAi: "Assistant",
  primaryAction: {
    label: "Dashboard",
    icon: LayoutDashboard,
  },

  tabs: [{ label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" }],

  sections: [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
      ],
    },

  ],
};
