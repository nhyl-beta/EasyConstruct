import {
  HardHat,
  Building2,
  Wallet,
  Users,
  LineChart,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

const pillars = [
  { icon: Building2, label: "Project delivery", detail: "Schedules, milestones, field logs" },
  { icon: Users, label: "Workforce", detail: "Attendance, allocation, payroll" },
  { icon: Wallet, label: "Finance", detail: "Budgets, expenses, approvals" },
  { icon: LineChart, label: "Analytics", detail: "Forecasts and executive reporting" },
];

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* Subtle blueprint grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at 30% 20%, black 10%, transparent 75%)",
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <HardHat className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">EasyConstruct</p>
            <p className="text-xs text-muted-foreground">
              Construction Decision Support System
            </p>
          </div>
        </div>
      </div>

      <div className="relative max-w-lg space-y-8">
        <div className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-ai" aria-hidden="true" />
            AI-assisted project intelligence
          </p>
          {/* The headline carries the message; the paragraph that used to
              follow it only restated the same claim in different words. */}
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Intelligent construction operations, powered by data and AI.
          </h2>
        </div>

        <ul className="grid grid-cols-2 gap-3">
          {pillars.map((p) => (
            <li
              key={p.label}
              className="rounded-lg border border-border/60 bg-background/40 p-4 backdrop-blur-sm"
            >
              <p.icon className="mb-2 size-4 text-primary-strong" aria-hidden="true" />
              <p className="text-sm font-medium">{p.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Role-based access control across every workspace.
      </p>
    </aside>
  );
}
