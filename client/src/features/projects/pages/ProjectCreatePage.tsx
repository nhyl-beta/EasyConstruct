import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiStepPage, type Step } from "@/components/ui/multi-step-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import { ProjectMemberRepository, type ProjectMemberRole } from "@/features/project-members/repositories/project-member.repository";
import { MilestoneRepository } from "@/features/milestones/repositories/milestone.repository";
import { LocationMapPicker } from "@/components/maps/location-map-picker";
import { useGeocodeSearch, type GeocodeSuggestion } from "@/components/maps/use-geocode-search";
import { useAuth } from "@/auth/auth-context";
import { ReferencePicker } from "@/features/reference/components/ReferencePicker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCode } from "@/lib/api-error";
import { useUsersByRole } from "@/features/users/hooks/use-users-by-role";
import { Flag, Info, MapPin, Trash2, UserCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import {
  DESIGN_DISCIPLINES,
  PROJECT_CURRENCIES,
  PROJECT_TYPES,
  RISK_LEVELS,
  type DeliveryType,
  type DesignDiscipline,
} from "@/features/projects/types/project.types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { StakeholderDraftEditor } from "@/features/stakeholders/components/StakeholderDraftEditor";
import type { StakeholderInput } from "@/features/stakeholders/repositories/stakeholder.repository";

// Architect and Consultant are required (D1) — the lifecycle's Proposal
// phase gate checks P1/P2 need both staffed before the project can ever
// advance past 4%.
const ASSIGNABLE_TEAM_ROLES: { role: ProjectMemberRole; label: string; required?: boolean }[] = [
  { role: "architect", label: "Architect", required: true },
  { role: "engineer", label: "Engineer" },
  { role: "site-personnel", label: "Site Personnel" },
  { role: "consultant", label: "Consultant", required: true },
];

type TeamSelections = Partial<Record<ProjectMemberRole, { id: number; name: string }>>;

interface MilestoneDraft {
  title: string;
  estimatedCompletionDate: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    title: "Project information",
    subtitle: "Basic details about the project",
  },
  {
    number: 2,
    title: "Scope & schedule",
    subtitle: "Define scope and timeline",
  },
  {
    number: 3,
    title: "Budget & financials",
    subtitle: "Set initial budget and financials",
  },
  {
    number: 4,
    title: "Team & stakeholders",
    subtitle: "Assign team and stakeholders",
  },
  {
    number: 5,
    title: "Review & confirm",
    subtitle: "Review and create project",
  },
];

interface ProjectFormData {
  name: string;
  code: string;
  client: string;
  clientEmail: string;
  location: string;
  risk: "low" | "medium" | "high";
  description: string;
  due: string;
  pm: string;
  contractValue: string;
  currency: string;
  // Collected for UX but not yet persisted — schema doesn't have these columns:
  contingencyPct: string;
  contractType: string;
  // Persisted (projects.project_type / planned_start_date / scope_summary).
  projectType: string;
  startDate: string;
  scopeSummary: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  geofenceRadiusM: number | null;
  // What the engagement delivers; a Design project has plan sets, no site works.
  deliveryType: DeliveryType;
  designDisciplines: DesignDiscipline[];
}

const initialForm: ProjectFormData = {
  name: "",
  code: "",
  client: "",
  clientEmail: "",
  location: "",
  risk: "low",
  description: "",
  due: "",
  pm: "",
  contractValue: "",
  contingencyPct: "",
  projectType: "",
  scopeSummary: "",
  contractType: "",
  currency: "PHP",
  startDate: "",
  siteLatitude: null,
  siteLongitude: null,
  geofenceRadiusM: null,
  deliveryType: "Construction",
  designDisciplines: [],
};

type FieldErrors = Record<string, string>;

/** Today as yyyy-MM-dd in the browser's timezone (the DatePicker's format). */
const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Errors for ONE wizard step, all at once — so pressing Next highlights every
 * missing field on that step immediately instead of surfacing them one at a
 * time on later steps or at submit. Mirrors the server validator
 * (server/src/validators/project-validator.ts), which stays the authority.
 */
function validateStep(step: number, data: ProjectFormData, isSelfAssigned: boolean, team: TeamSelections): FieldErrors {
  const errors: FieldErrors = {};
  const required = (key: string, value: string, label: string) => {
    if (!value.trim()) errors[key] = `${label} is required`;
  };

  if (step === 1) {
    required("name", data.name, "Project name");
    required("code", data.code, "Project code");
    required("client", data.client, "Client / Owner");
    if (data.clientEmail.trim() && !z.string().email().safeParse(data.clientEmail.trim()).success) {
      errors.clientEmail = "Enter a valid email address";
    }
    required("projectType", data.projectType, "Project type");
    required("location", data.location, "Location");
    if (data.deliveryType === "Design" && data.designDisciplines.length === 0) {
      errors.designDisciplines = "Choose at least one discipline to deliver";
    }

    const today = todayIso();
    if (!data.startDate) errors.startDate = "Planned start date is required";
    else if (data.startDate < today) errors.startDate = "Planned start date cannot be in the past";

    if (!data.due) errors.due = "Due date is required";
    else if (data.due < today) errors.due = "Due date cannot be in the past";
    else if (data.startDate && data.due < data.startDate) {
      errors.due = "Due date must be on or after the planned start date";
    }
  }

  if (step === 4) {
    if (!isSelfAssigned) required("pm", data.pm, "Project Manager");
    if (!team.architect) errors.architect = "Architect is required";
    if (!team.consultant) errors.consultant = "Consultant is required";
  }

  return errors;
}

export default function ProjectCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  // A Project Manager creating their own project is always its PM, so their
  // name is seeded. An Admin/IT Designer must PICK one — seeding their own
  // name there put a value in the Select that is not one of its options, so
  // Radix rendered an empty trigger AND suppressed the placeholder, which is
  // why that field looked like it had no placeholder at all.
  const [data, setData] = useState<ProjectFormData>(() => ({
    ...initialForm,
    pm: user?.role === "project-manager" ? user.name : "",
  }));
  // EC-013/018: optional team assignment at creation time, one person per
  // role — applied via project-members right after the project is created.
  const [team, setTeam] = useState<TeamSelections>({});
  // Draft milestones set during creation — applied via the milestones API
  // right after the project is created, same best-effort pattern as `team`.
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  // Stakeholders (owner, contractor...) typed in the "Team & stakeholders" step, sent with the create request.
  const [stakeholders, setStakeholders] = useState<StakeholderInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Fix 1.2: the shared client record picked (the name is also kept as text), and the
  // warning shown when a project with a similar name already exists.
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [similarProject, setSimilarProject] = useState<string | null>(null);

  // Editing a field clears its own error; the rest stay until fixed.
  const clearError = (key: string) =>
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const set = <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K],
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
    clearError(key as string);
    // The due date's rule depends on the start date and vice versa.
    if (key === "startDate") clearError("due");
  };

  const isSelfAssigned = user?.role === "project-manager";
  const isAdmin = user?.role === "admin" || user?.role === "it-designer";
  const projectsListRoute = isAdmin ? "/admin/projects" : "/projects";

  // Validate the current step before moving on. Blocks progression and marks
  // every invalid field on the step at once.
  const handleNext = () => {
    const errors = validateStep(step, data, isSelfAssigned, team);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Please complete the highlighted fields before continuing.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const handleCancel = () => navigate(projectsListRoute);

  const handleSubmit = async (confirmSimilar = false) => {
    // Every step was validated on the way through; re-check them all here so
    // a step that was edited after passing (or skipped via the stepper) can't
    // slip through, and jump back to the first step that has a problem.
    for (const s of [1, 4]) {
      const errors = validateStep(s, data, isSelfAssigned, team);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setStep(s);
        setError("Please complete the highlighted fields.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await ProjectRepository.create({
        name: data.name.trim(),
        code: data.code.trim(),
        client: data.client,
        clientEmail: data.clientEmail.trim() || undefined,
        clientId,
        confirmSimilar: confirmSimilar || undefined,
        currency: data.currency,
        location: data.location.trim(),
        risk: data.risk,
        due: data.due,
        pm: data.pm,
        description: data.description.trim() || undefined,
        projectType: data.projectType || undefined,
        plannedStartDate: data.startDate || undefined,
        scopeSummary: data.scopeSummary.trim() || undefined,
        // status/progress are lifecycle-owned now — every project starts at
        // Proposal/0% regardless of what's sent (server/src/lifecycle).
        // budget is utilisation-to-date (a percentage), which starts at zero;
        // the contract amount is its own column.
        budget: 0,
        contractValue: data.contractValue.trim()
          ? Number(data.contractValue)
          : undefined,
        workforce: 0,
        // A Design project has no site geofence: skip the pin entirely.
        siteLatitude: data.deliveryType === "Design" ? null : data.siteLatitude,
        siteLongitude: data.deliveryType === "Design" ? null : data.siteLongitude,
        geofenceRadiusM: data.deliveryType === "Design" ? null : data.geofenceRadiusM,
        deliveryType: data.deliveryType,
        designDisciplines: data.deliveryType === "Design" ? data.designDisciplines : undefined,
        stakeholders: stakeholders.length > 0 ? stakeholders : undefined,
      });

      const projectCode = created?.code ?? data.code.trim();
      const assignments = Object.entries(team) as [ProjectMemberRole, { id: number; name: string }][];
      // Best-effort: the project already exists at this point, so a failed
      // assignment shouldn't block navigation — it can still be added from
      // the project detail page.
      await Promise.allSettled(
        assignments.map(([role, person]) =>
          ProjectMemberRepository.create({
            projectCode,
            userId: person.id,
            userName: person.name,
            role,
          }),
        ),
      );

      // Same best-effort approach: the project exists either way, and any
      // milestone that fails to create can still be added from the detail
      // page's Milestones panel.
      await Promise.allSettled(
        milestones
          .filter((m) => m.title.trim())
          .map((m) =>
            MilestoneRepository.create({
              projectCode,
              title: m.title.trim(),
              estimatedCompletionDate: m.estimatedCompletionDate || undefined,
            }),
          ),
      );

      navigate(projectsListRoute);
    } catch (err) {
      // Fix 1.2: a project with a similar name exists. Ask before creating another.
      if (errorCode(err) === "SIMILAR_PROJECT") {
        setSimilarProject(err instanceof Error ? err.message : "A similar project already exists.");
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create project.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MultiStepPage
      title="New project"
      description={data.deliveryType === "Design" ? "Create a design project: plan sets delivered to the client, then handed over." : "Create a new construction project and set up the foundation for success."}
      steps={STEPS}
      currentStep={step}
      onNext={handleNext}
      onBack={() => {
        setError(null);
        setStep((s) => Math.max(s - 1, 1));
      }}
      onCancel={handleCancel}
      onSubmit={() => void handleSubmit()}
      isLastStep={step === STEPS.length}
      isFirstStep={step === 1}
      submitting={submitting}
      error={error}
      aiHint="Use AI to generate project timeline from a proposal or document."
    >
      {step === 1 && (
        <StepProjectInfo
          data={data}
          set={set}
          errors={fieldErrors}
          onClientId={setClientId}
          canAddClient={["project-manager", "admin", "it_designer", "it-designer"].includes(user?.role ?? "")}
        />
      )}
      {step === 2 && <StepScopeSchedule data={data} set={set} milestones={milestones} setMilestones={setMilestones} />}
      {step === 3 && <StepBudget data={data} set={set} />}
      {step === 4 && (
        <StepTeam
          data={data}
          set={set}
          currentUserRole={user?.role ?? ""}
          team={team}
          setTeam={(updater) => {
            setTeam(updater);
            clearError("architect");
            clearError("consultant");
          }}
          errors={fieldErrors}
          stakeholders={stakeholders}
          setStakeholders={setStakeholders}
        />
      )}
      {step === 5 && <StepReview data={data} />}
      <ConfirmDialog
        open={similarProject !== null}
        onOpenChange={(open) => !open && setSimilarProject(null)}
        title="A similar project already exists"
        description={similarProject ?? undefined}
        confirmLabel="Create anyway"
        destructive={false}
        loading={submitting}
        onConfirm={() => {
          setSimilarProject(null);
          void handleSubmit(true);
        }}
      />
    </MultiStepPage>
  );
}

// ── Step 1 — Project Information ─────────────────────────────────────────────

/** Red outline for an invalid control, applied on top of its own classes. */
const invalidClass = (error?: string) => (error ? "border-destructive focus-visible:ring-destructive/30" : "");

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs text-destructive-strong">
      {message}
    </p>
  ) : null;
}

function StepProjectInfo({
  data,
  set,
  errors,
  onClientId,
  canAddClient,
}: {
  data: ProjectFormData;
  set: <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K],
  ) => void;
  errors: FieldErrors;
  onClientId: (id: number | undefined) => void;
  canAddClient: boolean;
}) {
  // Part B item 6: the free-text Location input wasn't wired to the map at
  // all — typing an address did nothing until the pin was dragged by hand.
  // Debounced Nominatim forward geocoding now backs it with a suggestion
  // list; picking one both fills the text field and moves the pin.
  const geocode = useGeocodeSearch();
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Project information
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Provide the basic details of your new project.
        </p>
      </div>

      {/* Delivery type comes first: it decides which lifecycle the project follows. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          What is this project delivering? <span className="text-destructive-strong">*</span>
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery type">
          {([
            { value: "Construction", title: "Construction", body: "Design through site works, closeout and handover." },
            { value: "Design", title: "Design only", body: "Plan sets for the client: Proposal, Design, then Turnover." },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={data.deliveryType === o.value}
              onClick={() => set("deliveryType", o.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                data.deliveryType === o.value ? "border-primary bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <span className="block text-sm font-medium">{o.title}</span>
              <span className="block text-xs text-muted-foreground">{o.body}</span>
            </button>
          ))}
        </div>
        {data.deliveryType === "Design" && (
          <div className="space-y-1.5 rounded-xl border p-3">
            <Label>
              Disciplines to deliver <span className="text-destructive-strong">*</span>
            </Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {DESIGN_DISCIPLINES.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={data.designDisciplines.includes(d)}
                    onCheckedChange={(on) =>
                      set("designDisciplines", on ? [...data.designDisciplines, d] : data.designDisciplines.filter((x) => x !== d))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            <p className="text-overline text-muted-foreground">Each one becomes a plan set with its own lead, sheet range and status once the project reaches Design.</p>
            <FieldError message={errors.designDisciplines} />
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Project name <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. Westgate Commercial Tower"
            value={data.name}
            onChange={(e) => set("name", e.target.value)}
            className={cn("rounded-xl", invalidClass(errors.name))}
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="space-y-1.5">
          <Label>
            Project code <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. WGT-2025-001"
            value={data.code}
            onChange={(e) => set("code", e.target.value)}
            className={cn("rounded-xl", invalidClass(errors.code))}
            aria-invalid={!!errors.code}
          />
          <FieldError message={errors.code} />
        </div>

        {/* Fix 1.2: clients come from the shared list (one spelling per company), with Add new. The
            project still stores the name as text beside the link, so older screens keep working. */}
        <div className="space-y-1.5">
          <Label>
            Client / Owner <span className="text-destructive-strong">*</span>
          </Label>
          <ReferencePicker
            kind="clients"
            value={data.client}
            onChange={(name, id) => {
              set("client", name);
              onClientId(id);
            }}
            invalid={!!errors.client}
            canAdd={canAddClient}
            placeholder="Select a client"
          />
          <FieldError message={errors.client} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-client-email">Client email</Label>
          <Input
            id="project-client-email"
            type="email"
            placeholder="client@company.com"
            value={data.clientEmail}
            onChange={(e) => set("clientEmail", e.target.value)}
            className={cn("rounded-xl", invalidClass(errors.clientEmail))}
            aria-invalid={!!errors.clientEmail}
          />
          <p className="text-xs text-muted-foreground">Optional. RFIs and RFAs sent to the client go here.</p>
          <FieldError message={errors.clientEmail} />
        </div>

        <div className="space-y-1.5">
          <Label>
            Project type <span className="text-destructive-strong">*</span>
          </Label>
          <Select value={data.projectType || undefined} onValueChange={(v) => set("projectType", v)}>
            <SelectTrigger className={cn("rounded-xl", invalidClass(errors.projectType))} aria-invalid={!!errors.projectType}>
              <SelectValue placeholder="Select project type" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.projectType} />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label>
            Location <span className="text-destructive-strong">*</span>
          </Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Enter project location"
              value={data.location}
              onChange={(e) => {
                const value = e.target.value;
                set("location", value);
                geocode.setQuery(value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay so a click on a suggestion registers before the
                // list unmounts.
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              className={cn("rounded-xl pl-9", invalidClass(errors.location))}
              aria-invalid={!!errors.location}
              autoComplete="off"
            />
            {showSuggestions && (geocode.loading || geocode.suggestions.length > 0 || geocode.error) && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-md">
                {geocode.loading && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                )}
                {!geocode.loading && geocode.error && (
                  <div className="px-3 py-2 text-xs text-destructive-strong">{geocode.error}</div>
                )}
                {!geocode.loading &&
                  geocode.suggestions.map((s: GeocodeSuggestion, i: number) => (
                    <button
                      key={`${s.latitude}-${s.longitude}-${i}`}
                      type="button"
                      className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        set("location", s.displayName);
                        set("siteLatitude", s.latitude);
                        set("siteLongitude", s.longitude);
                        geocode.setQuery(s.displayName);
                        geocode.clearSuggestions();
                        setShowSuggestions(false);
                      }}
                    >
                      {s.displayName}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <FieldError message={errors.location} />
          <p className="text-overline text-muted-foreground">
            Start typing an address to search — selecting a result moves the map pin below.
          </p>
        </div>

        {/* Map pin sets siteLatitude/siteLongitude, and the geofence radius
            (geofenceRadiusM) is derived automatically the moment a point is
            pinned — see LocationMapPicker. */}
        {data.deliveryType !== "Design" && (
          <div className="col-span-2">
            <LocationMapPicker
              latitude={data.siteLatitude}
              longitude={data.siteLongitude}
              radiusM={data.geofenceRadiusM}
              onChange={({ latitude, longitude, radiusM }) => {
                set("siteLatitude", latitude);
                set("siteLongitude", longitude);
                set("geofenceRadiusM", radiusM);
              }}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>
            Risk level <span className="text-destructive-strong">*</span>
          </Label>
          <Select
            value={data.risk}
            onValueChange={(v) => set("risk", v as ProjectFormData["risk"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RISK_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Contract type</Label>
          <Select onValueChange={(v) => set("contractType", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select contract type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Lump Sum">Lump Sum</SelectItem>
              <SelectItem value="Cost Plus">Cost Plus</SelectItem>
              <SelectItem value="Time & Material">Time & Material</SelectItem>
              <SelectItem value="Unit Price">Unit Price</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Currency</Label>
          {/* Now a real selector: projects.currency exists, the API accepts
              it (project-validator.ts) and every amount on the project is
              rendered through it, so a non-PHP choice is one the system can
              actually honour. It was previously frozen at PHP because there
              was nowhere to store the value. */}
          <Select
            value={data.currency}
            onValueChange={(v) => set("currency", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          placeholder="Brief description of the project, objectives, and key deliverables..."
          value={data.description}
          onChange={(e) => set("description", e.target.value)}
          className="h-28 resize-none"
          maxLength={500}
        />
        <div className="text-right text-overline text-muted-foreground">
          {data.description.length}/500
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Planned start date <span className="text-destructive-strong">*</span>
          </Label>
          <DatePicker
            value={data.startDate}
            onChange={(v) => set("startDate", v)}
            placeholder="Select start date"
            min={todayIso()}
            clearable={false}
            invalid={!!errors.startDate}
          />
          <FieldError message={errors.startDate} />
        </div>
        <div className="space-y-1.5">
          <Label>
            Due date <span className="text-destructive-strong">*</span>
          </Label>
          <DatePicker
            value={data.due}
            onChange={(v) => set("due", v)}
            placeholder="Select due date"
            clearable={false}
            // Due can't precede the planned start, and neither can be past.
            min={data.startDate && data.startDate > todayIso() ? data.startDate : todayIso()}
            invalid={!!errors.due}
          />
          <FieldError message={errors.due} />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-strong" />
        <p className="text-xs text-muted-foreground">
          You can always edit these details later. All fields marked with{" "}
          <span className="font-medium text-destructive-strong">*</span> are required.
        </p>
      </div>
    </div>
  );
}

// ── Step 2 — Scope & Schedule ─────────────────────────────────────────────────

function StepScopeSchedule({
  data,
  set,
  milestones,
  setMilestones,
}: {
  data: ProjectFormData;
  set: <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K],
  ) => void;
  milestones: MilestoneDraft[];
  setMilestones: (updater: (prev: MilestoneDraft[]) => MilestoneDraft[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState("");

  const addMilestone = () => {
    if (!title.trim()) return;
    setMilestones((prev) => [...prev, { title: title.trim(), estimatedCompletionDate }]);
    setTitle("");
    setEstimatedCompletionDate("");
  };

  const removeMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Scope & schedule</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the project scope, and optionally draft the timeline
          milestones to create alongside it. Milestones start as drafts and
          can be edited from the project's detail page afterward.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Project scope summary</Label>
          <Textarea
            placeholder="Describe the full scope of work..."
            className="h-32 resize-none"
            value={data.scopeSummary}
            onChange={(e) => set("scopeSummary", e.target.value)}
            maxLength={5000}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Milestones (optional)</h4>
        </div>

        {milestones.length > 0 && (
          <ul className="space-y-2">
            {milestones.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{m.title}</span>
                  {m.estimatedCompletionDate && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Est. {m.estimatedCompletionDate}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive-strong"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <div className="space-y-1.5">
            <Label>Milestone title</Label>
            <Input
              placeholder="Foundation pour complete"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
             
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label>Estimated date</Label>
            <DatePicker
              value={estimatedCompletionDate}
              onChange={setEstimatedCompletionDate}
              placeholder="Select date"
            />
          </div>
          <Button type="button" variant="outline" onClick={addMilestone} disabled={!title.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — Budget ───────────────────────────────────────────────────────────

function StepBudget({
  data,
  set,
}: {
  data: ProjectFormData;
  set: <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K],
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Budget & financials</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Total contract value is saved with the project. Contingency is
          informational only — there's no column for it yet.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="contract-value">Total contract value</Label>
          <Input
            id="contract-value"
            type="number"
            min="0"
            value={data.contractValue}
            onChange={(e) => set("contractValue", e.target.value)}
            placeholder="0.00"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contingency">Contingency (%)</Label>
          <Input
            id="contingency"
            type="number"
            min="0"
            value={data.contingencyPct}
            onChange={(e) => set("contingencyPct", e.target.value)}
            placeholder="10"
           
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 4 — Team ─────────────────────────────────────────────────────────────

function StepTeam({
  data,
  set,
  currentUserRole,
  team,
  setTeam,
  errors,
  stakeholders,
  setStakeholders,
}: {
  data: ProjectFormData;
  set: <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K],
  ) => void;
  currentUserRole: string;
  team: TeamSelections;
  setTeam: (updater: (prev: TeamSelections) => TeamSelections) => void;
  errors: FieldErrors;
  stakeholders: StakeholderInput[];
  setStakeholders: (next: StakeholderInput[]) => void;
}) {
  // A Project Manager creating their own project can't assign a different
  // PM — it's always them. Admin/IT Designer still assign a real PM, picked
  // from actual project-manager accounts (not the old hardcoded name list).
  const isSelfAssigned = currentUserRole === "project-manager";
  const { users: pmOptions, loading: pmOptionsLoading } = useUsersByRole(
    isSelfAssigned ? null : "project-manager",
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Team & stakeholders</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSelfAssigned
            ? "You'll be assigned as this project's Project Manager."
            : "Assign the project team and key stakeholders."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Project Manager
            {!isSelfAssigned && <span className="text-destructive-strong"> *</span>}
          </Label>
          {isSelfAssigned ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{data.pm || "You"}</span>
            </div>
          ) : (
            <>
              <SearchableSelect
                value={data.pm || undefined}
                onValueChange={(v) => set("pm", v)}
                options={pmOptions.map((u) => ({ value: u.name, label: u.name, description: u.email }))}
                placeholder="Select project manager"
                searchPlaceholder="Search project managers…"
                emptyText="No project managers on file"
                loading={pmOptionsLoading}
                invalid={!!errors.pm}
              />
              <FieldError message={errors.pm} />
            </>
          )}
        </div>

        {ASSIGNABLE_TEAM_ROLES.map(({ role, label, required }) => (
          <TeamRolePicker
            key={role}
            role={role}
            label={label}
            required={required}
            selected={team[role] ?? null}
            error={errors[role]}
            onChange={(person) =>
              setTeam((prev) => {
                const next = { ...prev };
                if (person) next[role] = person;
                else delete next[role];
                return next;
              })
            }
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Architect and Consultant are required to start the project's
        lifecycle. Engineer and Site Personnel are optional here — any of
        these can also be added or changed later from the project's detail
        page.
      </p>

      <StakeholderDraftEditor value={stakeholders} onChange={setStakeholders} ownerHint={data.client.trim() || undefined} />
    </div>
  );
}

function TeamRolePicker({
  role,
  label,
  required,
  selected,
  error,
  onChange,
}: {
  role: ProjectMemberRole;
  label: string;
  required?: boolean;
  error?: string;
  selected: { id: number; name: string } | null;
  onChange: (person: { id: number; name: string } | null) => void;
}) {
  const { users, loading } = useUsersByRole(role);

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive-strong"> *</span>}
      </Label>
      <SearchableSelect
        value={selected ? String(selected.id) : undefined}
        onValueChange={(v) => {
          const user = users.find((u) => String(u.id) === v);
          onChange(user ? { id: user.id, name: user.name } : null);
        }}
        options={users.map((u) => ({ value: String(u.id), label: u.name, description: u.email }))}
        placeholder={`Select ${label.toLowerCase()}${required ? "" : " (optional)"}`}
        searchPlaceholder={`Search ${label.toLowerCase()}s…`}
        emptyText={`No ${label.toLowerCase()}s on file`}
        loading={loading}
        invalid={!!error}
      />
      <FieldError message={error} />
    </div>
  );
}

// ── Step 5 — Review ───────────────────────────────────────────────────────────

function StepReview({ data }: { data: ProjectFormData }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Review & confirm</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm project details before creating.
        </p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-muted/30">
        {[
          { label: "Project name", value: data.name || "—" },
          { label: "Project code", value: data.code || "—" },
          { label: "Client", value: data.client || "—" },
          { label: "Location", value: data.location || "—" },
          { label: "Project Manager", value: data.pm || "—" },
          { label: "Delivery", value: data.deliveryType === "Design" ? `Design only — ${data.designDisciplines.join(", ") || "no disciplines"}` : "Construction" },
          { label: "Project type", value: data.projectType || "—" },
          { label: "Risk", value: data.risk },
          { label: "Planned start date", value: data.startDate || "—" },
          { label: "Due date", value: data.due || "—" },
          { label: "Scope summary", value: data.scopeSummary.trim() ? data.scopeSummary.trim().slice(0, 120) + (data.scopeSummary.trim().length > 120 ? "…" : "") : "—" },
          { label: "Currency", value: data.currency },
          {
            label: "Total contract value",
            value: data.contractValue
              ? `${data.currency} ${Number(data.contractValue).toLocaleString()}`
              : "—",
          },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-5 py-3 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
