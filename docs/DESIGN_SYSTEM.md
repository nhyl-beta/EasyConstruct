# EasyConstruct Design System

Source of truth: the "EasyConstruct" Design System artifact,
<https://claude.ai/artifact/GApMSEzd2Ky4fFU1hFDdAs>. The client applies it as-is; do not
invent token values.

## How to read the artifact

Open the artifact, or read it with the Artifact tool (`action: "read"`, `path` = one of):

| File | What it holds |
| --- | --- |
| `project/README.md` | Usage rules: content, color, type, radius, KPIs, dashboard layout, UX principles |
| `project/tokens.json` | Every token, light and dark value, and a usage note |
| `project/assets/Tailwind/globals.css` | The drop-in stylesheet; `client/src/App.css` is this file plus the type-scale and focus additions below |
| `project/components/bundle.css` | Exact spacing, sizes and radii of each component |
| `project/components/<Name>/README.md` and `preview.html` | One component's rules and a reference render |
| `project/assets/References/` | Visual inspiration for KPIs and dashboards (colors there are not tokens) |

## Rules

- **Fixed palette.** Primary `oklch(0.6012 0.1202 168.97)` (operational green), secondary
  `oklch(0.9026 0.0486 84.55)` (warm sand), `ai` violet only for AI content. No new colors.
- **No raw colors in components.** Use token classes (`bg-card`, `text-muted-foreground`,
  `bg-primary-soft`, `text-primary-strong`, `border-border-strong`, `bg-success-soft text-success-strong`)
  or CSS variables. No hex, `oklch()`, `bg-white`, `text-black`, or Tailwind palette classes in app code.
- **Accessibility.**
  - Green text and icons on light grounds use `primary-strong`, never `primary`.
  - `warning` is a mark or meter fill only, never text; use `warning-strong` on `warning-soft`.
  - Status is never color alone: always a word, a value or an arrow.
  - Form-control outlines use `border-strong`.
  - Small labels on `primary` / `sidebar-primary` are weight 600.
  - Focus is a 2px `ring` with a 2px offset on every focusable element (a global `:focus-visible` rule in
    `App.css` does this; components use `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`).
  - Motion respects `prefers-reduced-motion` (global rule in `App.css`).
- **Type.** Space Grotesk 400/500/600, tabular numerals on every figure (set on `body`).
  Scale utilities: `text-page-title` 24/32, `text-title` 18/26, `text-section-title` 16/24,
  `text-body` 14/20, `text-caption` 12/16, `text-overline` 11/16 (uppercase with `uppercase`), `text-kpi-value` 32/36.
- **Radius.** Cards and KPI tiles `rounded-lg`; nav items and the segmented track `rounded-md`;
  buttons and inputs `rounded-sm`; icon tiles `rounded-xl`; dialogs `rounded-2xl` with `shadow-xl`;
  badges, dots and meters `rounded-full`.
- **Layout.** One page header (breadcrumb, `page-title`, status chips and actions on one row), then the KPI row
  (four cards, never more than five), then charts and side panels, then tables. Dashboard sections sit `space-y-10` apart.
- **Presentation only.** Hooks, repositories, services, providers, access control, routing and data are not part
  of the design system.
- **Both themes.** Check every page with the `.dark` class on and off.

## Components

All shared components live in `client/src/components/ui` unless noted.

| Component | File | Notes |
| --- | --- | --- |
| Button | `button.tsx` | Variants `default`, `strong`, `secondary`, `quiet`, `outline`, `ghost`, `link`, `danger` (alias `destructive`); 40px, weight 600 |
| Input / Textarea / Select | `input.tsx`, `textarea.tsx`, `select.tsx` | 40px, `border-border-strong`, `rounded-sm` |
| Card | `card.tsx` | `rounded-lg`, 1px border, `shadow-sm` |
| Badge | `badge.tsx` | Adds tone variants `success`, `warning`, `danger`, `info`, `ai`, `brand` |
| StatusBadge | `status-badge.tsx` | State pill with a dot and a word; tone from `config/status-config.ts` or the `tone` prop |
| Tabs (segmented) | `tabs.tsx` | Sunken `muted` track, lifted active segment |
| Table | `table.tsx` | Hairline row borders, `caption` muted headers, `muted` hover |
| Dialog / AlertDialog | `dialog.tsx`, `alert-dialog.tsx` | `rounded-2xl`, `shadow-xl`, `bg-card` |
| Sidebar | `sidebar.tsx`, `refine-ui/layout/sidebar.tsx` | 40px items, `overline` group labels, solid `sidebar-primary` active pill, 300px |
| KpiCard, KpiDelta | `kpi-card.tsx` | Delta `direction` (up, down, flat) and `tone` (good, bad, neutral) are separate props |
| KpiStrip | `kpi-strip.tsx` | Row of `KpiCard`s; prop API unchanged |
| Sparkline | `sparkline.tsx` | Pure SVG, `chart-1` line over `primary-soft` area |
| UtilizationTile | `utilization-tile.tsx` | Below 60% Healthy, 60 to 85% Busy, above 85% Critical |
| RingGauge | `ring-gauge.tsx` | `chart-1` stroke on a `muted` track, value in the centre |
| SegmentedControl | `segmented-control.tsx` | Two to four one-word options |
| NotificationCard | `notification-card.tsx` | State dot, headline, one line, actions, relative time |
| SectionCard | `section-card.tsx` | Card with a `section-title` header |
| PageHeader | `refine-ui/views/page-header.tsx` | Breadcrumb, title, status chips, actions |

The dev-only gallery at `/design-system` (`client/src/pages/dev/design-system.tsx`) renders all of them.
It is registered only when `import.meta.env.DEV`, is not a Refine resource, and is absent from the production bundle.

## Charts

Recharts stays. Series colors are `var(--chart-1)` to `var(--chart-5)` in order; status series use
`var(--success)`, `var(--warning)`, `var(--destructive)`. Label series directly where possible; never rely on color alone.

## Known exceptions to the no-raw-color rule

- `pages/roles/shared/print-pages.tsx`: print stylesheet for paper forms (black on white by design).
- `components/maps/location-map-picker.tsx`: Leaflet path options need a literal color; CSS variables do not resolve there.
- `components/ui/chart.tsx`: the `stroke='#ccc'` attribute selector targets Recharts' own default.
