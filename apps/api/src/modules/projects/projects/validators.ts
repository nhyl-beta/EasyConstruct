import { z } from 'zod';
import { DELIVERABLE_DISCIPLINES, DELIVERY_TYPES } from "../lifecycle/delivery.js";
import { stakeholderInputSchema } from "../project-stakeholders/validators.js";

// Project types offered by the New Project wizard. Closed list so the
// Projects table's type filter only ever sees values it can group on.
export const PROJECT_TYPES = [
  'Commercial',
  'Residential',
  'Infrastructure',
  'Industrial',
  'Renewable Energy',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

// "Today" in the business's own timezone — a server running in UTC would
// otherwise reject a date that is still today in Manila for the first eight
// hours of the day.
const todayIso = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const baseProjectSchema = z.object({
  name:        z.string().min(2),
  code:        z.string().min(2).max(20),
  pm:          z.string().min(2),
  assignedEngineer: z.string().optional(),
  // `status`/`statusTone`/`progress` are accepted here only because create
  // forces them anyway (projects/service.ts create) — whatever the client
  // sends is overwritten with Proposal/neutral/0, never trusted.
  status:      z.string().optional(),
  statusTone:  z.string().optional(),
  progress:    z.number().min(0).max(100).optional(),
  budget:      z.number().min(0).optional(),
  contractValue: z.union([z.number().nonnegative(), z.string()]).optional().nullable(),
  due:         isoDate,
  risk:        z.enum(['Low', 'Medium', 'High']).optional(),
  location:    z.string().optional(),
  client:      z.string().optional(),
  clientEmail: z.union([z.string().trim().email('Enter a valid client email').max(255), z.literal(''), z.null()]).optional(),
  clientId:    z.number().int().positive().optional(),
  // Not stored: confirms a new project whose name is close to an existing one.
  confirmSimilar: z.boolean().optional(),
  // ISO 4217. Kept to a closed list rather than free text so the
  // stored code always matches one the formatters can render.
  currency:    z.enum(['PHP', 'USD', 'EUR', 'AUD', 'SGD', 'JPY', 'AED']).optional(),
  workforce:   z.number().optional(),
  description: z.string().max(500).optional(),
  projectType:      z.enum(PROJECT_TYPES).optional(),
  plannedStartDate: isoDate.optional(),
  scopeSummary:     z.string().max(5000).optional(),
  // Geofencing has always been evaluated against these three columns
  // (attendance/service.ts), but nothing could ever set them: they were
  // absent from this schema, so validate() stripped them from every request
  // and every project kept siteLatitude/siteLongitude NULL. With no fence to
  // measure against, every site clock-in fell through to the "Outside"
  // default and HR was handed a flag it had no way to check.
  siteLatitude:    z.union([z.number().min(-90).max(90), z.literal(""), z.null()]).optional(),
  siteLongitude:   z.union([z.number().min(-180).max(180), z.literal(""), z.null()]).optional(),
  geofenceRadiusM: z.union([z.number().int().min(10).max(20000), z.null()]).optional(),
});

// Start and due dates. The ordering rule applies on create and update alike;
// "not in the past" applies to create only — an update to an already-overdue
// project (say, editing its description) must not be refused because its
// original due date has since passed.
export const createProjectSchema = baseProjectSchema
  .extend({
    plannedStartDate: isoDate,
    // What the engagement delivers; fixed at creation (not editable later).
    deliveryType: z.enum(DELIVERY_TYPES).optional(),
    designDisciplines: z.array(z.enum(DELIVERABLE_DISCIPLINES)).max(DELIVERABLE_DISCIPLINES.length).optional(),
    // Stakeholders typed into the wizard's "Team & stakeholders" step; stored in project_stakeholders (change #4).
    stakeholders: z.array(stakeholderInputSchema).max(20).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.deliveryType === 'Design' && (data.designDisciplines?.length ?? 0) === 0) {
      ctx.addIssue({ code: 'custom', path: ['designDisciplines'], message: 'Choose at least one discipline for a Design project' });
    }
    const today = todayIso();
    if (data.plannedStartDate < today) {
      ctx.addIssue({ code: 'custom', path: ['plannedStartDate'], message: 'Planned start date cannot be in the past' });
    }
    if (data.due < today) {
      ctx.addIssue({ code: 'custom', path: ['due'], message: 'Due date cannot be in the past' });
    }
    if (data.due < data.plannedStartDate) {
      ctx.addIssue({ code: 'custom', path: ['due'], message: 'Due date must be on or after the planned start date' });
    }
  });

// status/progress are lifecycle-owned from here on (see
// lifecycle/service.ts refreshProjectProgress, the only writer of
// `progress`, and lifecycle/routes.ts advance/hold/resume/cancel/archive,
// the only writers of `status`). A plain project PATCH can no longer touch
// either — projects/service.update throws if either key is present, as a
// second guard for anything that reaches the service without going through
// this schema.
export const updateProjectSchema = baseProjectSchema
  .omit({ status: true, statusTone: true, progress: true })
  .partial()
  // Rows created before dates were validated may hold a non-ISO due string;
  // an edit that leaves it alone must still be accepted.
  .extend({ due: z.string().min(1).optional() })
  .superRefine((data, ctx) => {
    if (data.plannedStartDate && data.due && data.due < data.plannedStartDate) {
      ctx.addIssue({ code: 'custom', path: ['due'], message: 'Due date must be on or after the planned start date' });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;