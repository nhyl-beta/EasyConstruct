// apps/api/src/attendance/heatmap.ts
//
// The HR "Site heatmap" and its summary stats, computed from real attendance
// rows: clock-ins per site per day over the last N days, plus on-time rate,
// late arrivals per day and average shift length. Pure; the controller feeds
// it the rows from the last N days.
export interface HeatmapRow {
  site: string;
  logDate: string;
  attendanceStatus: string;
  clockOut: string | null;
  hours: string | number | null;
}

export interface HeatmapSite {
  site: string;
  total: number;
  max: number;
  cells: { day: string; count: number }[];
}

export interface HeatmapResult {
  days: string[];
  sites: HeatmapSite[];
  onTimeRate: number | null;
  lateArrivalsPerDay: number | null;
  avgShiftHours: number | null;
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const lastDays = (count: number, today: Date = new Date()): string[] => {
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(key(d));
  }
  return days;
};

export const buildHeatmap = (
  rows: HeatmapRow[],
  dayCount = 14,
  maxSites = 6,
  today: Date = new Date(),
): HeatmapResult => {
  const days = lastDays(dayCount, today);
  const inWindow = rows.filter((r) => days.includes(r.logDate.slice(0, 10)));

  const bySite = new Map<string, Map<string, number>>();
  for (const r of inWindow) {
    const day = r.logDate.slice(0, 10);
    const counts = bySite.get(r.site) ?? new Map<string, number>();
    counts.set(day, (counts.get(day) ?? 0) + 1);
    bySite.set(r.site, counts);
  }
  const sites = [...bySite.entries()]
    .map(([site, counts]) => ({
      site,
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      max: Math.max(...counts.values()),
      cells: days.map((day) => ({ day, count: counts.get(day) ?? 0 })),
    }))
    .sort((a, b) => b.total - a.total || a.site.localeCompare(b.site))
    .slice(0, maxSites);

  const worked = inWindow.filter((r) => r.attendanceStatus === "Present" || r.attendanceStatus === "Late");
  const late = worked.filter((r) => r.attendanceStatus === "Late");
  const daysWithRecords = new Set(worked.map((r) => r.logDate.slice(0, 10))).size;
  const shifts = inWindow.filter((r) => r.clockOut && Number(r.hours) > 0);

  return {
    days,
    sites,
    onTimeRate: worked.length === 0 ? null : ((worked.length - late.length) / worked.length) * 100,
    lateArrivalsPerDay: daysWithRecords === 0 ? null : late.length / daysWithRecords,
    avgShiftHours: shifts.length === 0 ? null : shifts.reduce((s, r) => s + Number(r.hours), 0) / shifts.length,
  };
};
