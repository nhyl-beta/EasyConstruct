import { useState } from "react";
import { Bell, FileText, Hammer, TrendingUp, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/ui/kpi-card";
import { NotificationCard } from "@/components/ui/notification-card";
import { RingGauge } from "@/components/ui/ring-gauge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { UtilizationTile } from "@/components/ui/utilization-tile";
import type { StatusTone } from "@/config/status-tone";

/**
 * Dev-only gallery of every design-system component (route /design-system,
 * registered only when import.meta.env.DEV, and not a Refine resource, so it
 * never appears in any role's sidebar). docs/DESIGN_SYSTEM.md lists the files.
 */
const TONES: { status: string; tone: StatusTone }[] = [
  { status: "On track", tone: "success" },
  { status: "At risk", tone: "warning" },
  { status: "Delayed", tone: "danger" },
  { status: "In review", tone: "info" },
  { status: "AI suggested", tone: "ai" },
  { status: "Active", tone: "brand" },
  { status: "Draft", tone: "neutral" },
];

const UTILIZATION: { label: string; percent: number }[] = [
  { label: "Concrete mixer", percent: 38 },
  { label: "Scaffolding", percent: 52 },
  { label: "Tower crane A", percent: 78 },
  { label: "Skilled labor", percent: 85 },
  { label: "Excavator 2", percent: 92 },
  { label: "Dump trucks", percent: 95 },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-section-title font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemShowcase() {
  const [range, setRange] = useState("1W");

  return (
    <div className="space-y-10 p-6">
      <header>
        <h1 className="text-page-title font-semibold">Design system</h1>
        <p className="text-body text-muted-foreground">
          Development only. Toggle the theme to check both palettes.
        </p>
      </header>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Update Billing</Button>
          <Button variant="strong">Reply</Button>
          <Button variant="secondary">Export</Button>
          <Button variant="quiet">Dismiss</Button>
          <Button variant="danger">Stop Jobs</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Block>

      <Block title="KPI cards">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Project progress"
            icon={TrendingUp}
            value="72%"
            subLabel="Across 6 active sites"
            spark={[34, 30, 32, 24, 26, 16, 18, 8, 10].map((v) => 44 - v)}
            delta={{ direction: "up", tone: "good", value: "4.2%", label: "vs last month" }}
          />
          <KpiCard
            label="Open RFIs"
            icon={FileText}
            value="14"
            subLabel="5 high priority"
            spark={[32, 30, 26, 22, 12, 14, 10]}
            delta={{ direction: "down", tone: "good", value: "2", label: "Closed this week" }}
          />
          <KpiCard
            label="Workers on site"
            icon={Users}
            value="128"
            subLabel="Checked in today"
            delta={{ direction: "flat", tone: "neutral", label: "vs yesterday" }}
          />
          <KpiCard
            label="Equipment alerts"
            icon={Hammer}
            value="3"
            subLabel="Needs a decision"
            delta={{ direction: "up", tone: "bad", value: "1", label: "since Monday" }}
          />
        </div>
      </Block>

      <Block title="Utilization tiles">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {UTILIZATION.map((u) => (
            <UtilizationTile key={u.label} {...u} />
          ))}
        </div>
      </Block>

      <Block title="Ring gauges">
        <div className="flex flex-wrap gap-6">
          <RingGauge percent={72} label="Project progress" />
          <RingGauge percent={35} label="Leave balance">
            <span>7 days</span>
          </RingGauge>
        </div>
      </Block>

      <Block title="Status badges">
        <div className="flex flex-wrap gap-3">
          {TONES.map((t) => (
            <StatusBadge key={t.status} status={t.status} tone={t.tone} />
          ))}
        </div>
      </Block>

      <Block title="Segmented control">
        <SegmentedControl
          aria-label="Chart range"
          value={range}
          onValueChange={setRange}
          options={[
            { value: "1D", label: "1D" },
            { value: "1W", label: "1W" },
            { value: "1M", label: "1M" },
          ]}
        />
      </Block>

      <Block title="Inputs">
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="ds-name">Project name</Label>
          <Input id="ds-name" placeholder="Riverside Tower" />
          <p className="text-caption text-muted-foreground">Shown on every report.</p>
        </div>
      </Block>

      <Block title="Notification cards">
        <div className="grid max-w-xl gap-3">
          <NotificationCard
            state="danger"
            title={<>We couldn&apos;t process your <strong>renewal</strong></>}
            body="Update your billing details before 12 Oct to keep access."
            actions={
              <>
                <Button>Update Billing</Button>
                <Button variant="quiet">Dismiss</Button>
              </>
            }
            time="5 mins ago"
            leading={
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
                <Bell className="size-5" />
              </span>
            }
          />
          <NotificationCard
            state="info"
            tint
            title={<>RFI-0042 mentioned <strong>you</strong></>}
            body="Reply to keep the structural review on schedule."
            time="2hrs ago"
          />
          <NotificationCard state="read" title="Weekly report is ready" time="Yesterday at 4:30 PM" />
        </div>
      </Block>
    </div>
  );
}
