import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import { PROJECT_CURRENCIES, PROJECT_TYPES, RISK_LEVELS, type Project } from "@/features/projects/types/project.types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { downloadFileUrl } from "@/lib/file-url";
import { formatCurrency } from "@/lib/format-currency";
import { useProjectMembers } from "@/features/project-members/hooks/use-project-members";
import { MilestonesPanel } from "@/features/milestones/components/MilestonesPanel";
import { SuggestedPlanPanel } from "@/features/plan-suggestions/components/SuggestedPlanPanel";
import { LocationMapPicker } from "@/components/maps/location-map-picker";
import { useProjectDesigns } from "@/features/designs/hooks/useProjectDesigns";
import { ProjectRevisionsPanel } from "@/features/designs/components/ProjectRevisionsPanel";
import { ProjectRequestsSection } from "@/features/requests/components/ProjectRequestsSection";
import { PlanSetsSection } from "../components/PlanSetsSection";
import { StatusBadge } from "@/components/ui/status-badge";
import { documentsRepository, type DocumentRecord } from "@/features/documents/repositories/documents.repository";
import { ProjectLifecyclePanel } from "@/features/lifecycle/components/ProjectLifecyclePanel";
import { RequirementsPanel } from "@/features/requirements/components/RequirementsPanel";
import type { ProjectMemberRole } from "@/features/project-members/repositories/project-member.repository";
import { useUsersByRole } from "@/features/users/hooks/use-users-by-role";
import { ArrowLeft, FileText, HardHat, Loader2, PencilRuler, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { z } from "zod";
import { useAuth } from "@/auth/auth-context";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";
import { ReportsTab } from "@/features/reports/components/ReportsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StakeholdersPanel } from "@/features/stakeholders/components/StakeholdersPanel";

/**
 * Who may change the record itself. This mirrors the route guards on
 * /api/projects (apps/api/src/projects/routes.ts): POST, PATCH and DELETE are
 * granted to project-manager and admin. Everyone else — IT Designer, Owner,
 * Consultant, Architect, HR, Finance — can read a project but any write they
 * attempt comes back 403. (IT Designer is system administration, not project
 * delivery, so the Project section is read-only for it.)
 */
const PROJECT_EDITORS = ["project-manager", "admin"];

/**
 * Who may remove an uploaded document (apps/api/src/documents/routes.ts). A
 * governance action, separate from editing the project record.
 */
const DOCUMENT_REMOVERS = ["admin", "owner", "it-designer"];

/** Today as yyyy-MM-dd in the browser's timezone. */
const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Where "Back" goes for each role. A viewer who reached this page from their
 * own list should return to it; /projects is the Project Manager's page and
 * is not in most of these roles' navigation at all.
 */
const LIST_ROUTE_BY_ROLE: Record<string, string> = {
  owner: "/owner/portfolio",
  consultant: "/consultant/projects",
  architect: "/architect/projects",
  admin: "/admin/projects",
  "it-designer": "/admin/projects",
};

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  const navigate = useNavigate();
  const { user } = useAuth();

  const role = user?.role ?? "";
  // Editability is derived from the actual API grant rather than from a
  // single "is this the engineer" check. Owner reached this page from the
  // executive portfolio and was handed the Project Manager's full edit form —
  // Save and Delete included — every button on which returns 403. Read-only
  // roles now get a read-only record.
  const canEdit = PROJECT_EDITORS.includes(role);
  const listRoute = LIST_ROUTE_BY_ROLE[role] ?? "/projects";

  const [project, setProject] = useState<Project | null>(null);
  // The due date as loaded: an already-overdue project must still be savable
  // when its due date is left alone, so "not in the past" only applies to a
  // date that was actually changed.
  const [loadedDue, setLoadedDue] = useState<string | null>(null);
  const { users: pmOptions, loading: pmOptionsLoading } = useUsersByRole(
    role === "admin" ? "project-manager" : null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    ProjectRepository.getById(projectId ?? "")
      .then((result) => {
        if (active) {
          setProject(result);
          setLoadedDue(result?.due ?? null);
          if (!result) setError("Project not found.");
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load project.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const update = <K extends keyof Project>(key: K, value: Project[K]) => {
    setProject((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    if (!project) return;
    if (!project.name.trim() || !project.code.trim() || !project.due.trim()) {
      setError("Name, code, and due date are required.");
      return;
    }
    if (project.clientEmail?.trim() && !z.string().email().safeParse(project.clientEmail.trim()).success) {
      setError("Enter a valid client email address.");
      return;
    }
    if (project.due !== loadedDue && project.due < todayIso()) {
      setError("Due date cannot be in the past.");
      return;
    }
    if (project.plannedStartDate && project.due < project.plannedStartDate) {
      setError("Due date must be on or after the planned start date.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await ProjectRepository.patch(project.code, {
        name: project.name.trim(),
        code: project.code.trim(),
        client: project.client,
        // "" clears it; the API stores NULL.
        clientEmail: project.clientEmail ?? "",
        currency: project.currency,
        location: project.location,
        // status/progress are lifecycle-owned now (apps/api/src/lifecycle) —
        // sending them here is rejected by the API; see ProjectLifecyclePanel.
        budget: project.budget,
        contractValue: project.contractValue,
        workforce: project.workforce,
        due: project.due,
        risk: project.risk,
        description: project.description,
        projectType: project.projectType,
        plannedStartDate: project.plannedStartDate,
        scopeSummary: project.scopeSummary,
        // Only Admin can reassign the PM (Project Managers see it read-only).
        ...(role === "admin" ? { pm: project.pm } : {}),
        siteLatitude: project.siteLatitude,
        siteLongitude: project.siteLongitude,
        geofenceRadiusM: project.geofenceRadiusM,
      });
      if (!updated) throw new Error("Project could not be updated.");
      // Was just setProject(updated) + a "Project saved." message that sat
      // on this same form — after confirming a save, the app should return
      // to the project table, not leave the editor open as if nothing
      // happened. Matches the New Project wizard, which already navigates
      // back to the list on success.
      navigate(listRoute);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    setConfirmDeleteOpen(false);
    setDeleting(true);
    setError(null);
    try {
      const deleted = await ProjectRepository.delete(project.code);
      if (!deleted) throw new Error("Project could not be deleted.");
      navigate(listRoute);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <PageHeader title="Project" description="Loading project…" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <PageHeader title="Project not found" />
        <p className="text-sm text-destructive-strong">{error ?? "Project not found."}</p>
        <Button asChild variant="outline"><Link to={listRoute}>Back to projects</Link></Button>
      </div>
    );
  }

  const isDesignProject = project.deliveryType === "Design";
  const riskLabel =
    RISK_LEVELS.find((level) => level.value === project.risk)?.label ?? project.risk;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <Button asChild variant="ghost">
        <Link to={listRoute}><ArrowLeft className="mr-2 h-4 w-4" />Back to projects</Link>
      </Button>
      <PageHeader
        title={project.name}
        description={project.code}
        breadcrumbLabel={project.name}
        actions={
          canEdit && (
            <Button
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={saving || deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
          )
        }
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${project.name}?`}
        description="This permanently deletes the project and cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={remove}
      />
      <Tabs value={tab} onValueChange={(v) => setSearchParams(v === "reports" ? { tab: "reports" } : {}, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">{error}</div>}
      {/* Was border-green-500/bg-green-500/text-green-700 — same dark-mode
          contrast bug as RISK_CLASS (see project-status.ts): a raw Tailwind
          palette color with no dark-mode variant, unlike the semantic
          `success` token used here now, which App.css redefines per theme. */}
      {message && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-strong">{message}</div>}

      <div className="max-w-4xl">
        <ProjectLifecyclePanel projectId={project.id} projectCode={project.code} />
      </div>

      {!canEdit && (
        <p className="max-w-4xl text-sm text-muted-foreground">
          This is a read-only view of the project record. Changes are the
          Project Manager's to make.
        </p>
      )}

      {/* Fields the current role cannot change are rendered as plain values.
          They used to be `<Input readOnly>` / `<Textarea readOnly>` /
          disabled `<Select>`, which look like editable controls, carry
          placeholder text where the record is simply empty, and invite an
          edit the API would refuse. A value nobody can change is text. */}
      <div className="grid max-w-4xl grid-cols-1 gap-5 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
        <Field label="Project name">
          {canEdit
            ? <Input value={project.name} onChange={(e) => update("name", e.target.value)} />
            : <ReadOnlyValue value={project.name} />}
        </Field>
        <Field label="Project code">
          {canEdit
            ? <Input value={project.code} onChange={(e) => update("code", e.target.value)} />
            : <ReadOnlyValue value={project.code} mono />}
        </Field>
        <Field label="Client">
          {canEdit
            ? <Input value={project.client} onChange={(e) => update("client", e.target.value)} />
            : <ReadOnlyValue value={project.client} />}
        </Field>
        <Field label="Client email">
          {canEdit
            ? <Input type="email" placeholder="client@company.com" value={project.clientEmail ?? ""} onChange={(e) => update("clientEmail", e.target.value)} />
            : <ReadOnlyValue value={project.clientEmail ?? ""} />}
        </Field>
        <Field label="Location">
          {canEdit
            ? <Input value={project.location} onChange={(e) => update("location", e.target.value)} />
            : <ReadOnlyValue value={project.location} />}
        </Field>
        <Field label="Project type">
          {canEdit ? (
            <Select
              value={project.projectType ?? undefined}
              onValueChange={(v) => update("projectType", v)}
            >
              <SelectTrigger><SelectValue placeholder="Select project type" /></SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ReadOnlyValue value={project.projectType} />
          )}
        </Field>
        <Field label="Delivery">
          <ReadOnlyValue value={project.deliveryType === "Design" ? `Design only — ${(project.designDisciplines ?? []).join(", ") || "no plan sets chosen"}` : "Construction"} />
        </Field>
        <Field label="Planned start date">
          {canEdit
            ? <DatePicker value={project.plannedStartDate ?? ""} onChange={(v) => update("plannedStartDate", v || null)} placeholder="Select start date" />
            : <ReadOnlyValue value={project.plannedStartDate} />}
        </Field>
        {/* Status is lifecycle-owned — see ProjectLifecyclePanel above, which
            is where it's actually changed (Advance/Hold/Resume/Cancel/
            Archive). Shown here as a plain badge, not an editable field, for
            any role including the PM/Admin who otherwise can edit this form. */}
        <Field label="Status">
          <StatusBadge status={project.status} />
        </Field>
        {/* Risk was a free-text Input, so any spelling ("hi", "Severe") could
            be typed here; the value drives risk sorting on the Admin/PM/Owner
            dashboards and the backend enum only accepts Low/Medium/High, so a
            typo either failed the save or produced a project that sorted as
            "low" forever. Constrained to the same three levels the New
            Project form offers. */}
        <Field label="Risk">
          {canEdit ? (
            <Select
              value={project.risk}
              onValueChange={(v) => update("risk", v as Project["risk"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ReadOnlyValue value={riskLabel} />
          )}
        </Field>
        <Field label="Budget used (%)">
          {canEdit
            ? <Input type="number" min="0" value={project.budget} onChange={(e) => update("budget", Number(e.target.value))} />
            : <ReadOnlyValue value={`${project.budget}%`} />}
        </Field>
        <Field label="Currency">
          {canEdit ? (
            <Select value={project.currency} onValueChange={(v) => update("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ReadOnlyValue value={project.currency} />
          )}
        </Field>
        <Field label="Total contract value">
          {canEdit
            ? <Input type="number" min="0" value={project.contractValue ?? ""} onChange={(e) => update("contractValue", e.target.value === "" ? null : Number(e.target.value))} />
            // Was hardcoded to PHP formatting regardless of the project's
            // actual currency — see project-format.ts's formatContractValue
            // for the same bug on the table view.
            : <ReadOnlyValue value={project.contractValue == null ? null : formatCurrency(project.contractValue, project.currency)} />}
        </Field>
        <Field label="Workforce">
          {canEdit
            ? <Input type="number" min="0" value={project.workforce} onChange={(e) => update("workforce", Number(e.target.value))} />
            : <ReadOnlyValue value={String(project.workforce)} />}
        </Field>
        <Field label="Due date">
          {canEdit
            ? <DatePicker
                value={project.due}
                onChange={(v) => update("due", v)}
                placeholder="Select due date"
                clearable={false}
                min={project.plannedStartDate ?? undefined}
              />
            : <ReadOnlyValue value={project.due} />}
        </Field>
        <Field label="Project manager">
          {role === "admin" ? (
            <SearchableSelect
              value={project.pm || undefined}
              onValueChange={(v) => update("pm", v)}
              options={[
                // Keep the current PM selectable even if they are no longer
                // listed (e.g. a deactivated account).
                ...(project.pm && !pmOptions.some((u) => u.name === project.pm)
                  ? [{ value: project.pm, label: project.pm }]
                  : []),
                ...pmOptions.map((u) => ({ value: u.name, label: u.name, description: u.email })),
              ]}
              placeholder="Select project manager"
              searchPlaceholder="Search project managers…"
              loading={pmOptionsLoading}
            />
          ) : (
            // A Project Manager can't hand their own project to someone else.
            <ReadOnlyValue value={project.pm} />
          )}
        </Field>
        <Field label="Description" wide>
          {canEdit
            ? <Textarea value={project.description ?? ""} maxLength={500} onChange={(e) => update("description", e.target.value)} />
            : <ReadOnlyValue value={project.description} multiline />}
        </Field>
        <Field label="Scope summary" wide>
          {canEdit
            ? <Textarea value={project.scopeSummary ?? ""} maxLength={5000} onChange={(e) => update("scopeSummary", e.target.value)} />
            : <ReadOnlyValue value={project.scopeSummary} multiline />}
        </Field>

        {/* Site geofence. attendance/service.ts measures every site clock-in
            against these three columns. Was three plain number inputs for
            lat/lng/radius — accurate coordinates are hard to type by hand, so
            this is now a map pin instead, with the geofence derived from it
            automatically (see LocationMapPicker). A Design project has no site
            works, so no geofence. */}
        {!isDesignProject && (<>
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold">Site geofence</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Site Personnel clock-ins are measured against this position. Leave
            it unpinned to record attendance without a geofence check — HR
            then confirms those clock-ins by hand.
          </p>
        </div>
        <div className="md:col-span-2">
          {canEdit ? (
            <LocationMapPicker
              latitude={project.siteLatitude ?? null}
              longitude={project.siteLongitude ?? null}
              radiusM={project.geofenceRadiusM ?? null}
              onChange={({ latitude, longitude, radiusM }) => {
                update("siteLatitude", latitude);
                update("siteLongitude", longitude);
                update("geofenceRadiusM", radiusM);
              }}
            />
          ) : project.siteLatitude != null && project.siteLongitude != null ? (
            <ReadOnlyValue
              value={`${project.siteLatitude}, ${project.siteLongitude} · ${project.geofenceRadiusM ?? 300} m radius`}
              mono
            />
          ) : (
            <ReadOnlyValue value={null} />
          )}
        </div>
        </>)}

      </div>

      {/* The team is part of "the details per project", so viewers see it —
          as a list, without the add/remove controls their role cannot use. */}
      <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
        <TeamMemberPanel
          projectCode={project.code}
          role="engineer"
          label="Engineers"
          readOnly={!canEdit}
          description={
            canEdit
              ? "Engineers marked available here can be assigned to designs on this project by an Architect."
              : undefined
          }
        />
        <TeamMemberPanel projectCode={project.code} role="architect" label="Architects" readOnly={!canEdit} />
        {!isDesignProject && (
          <TeamMemberPanel projectCode={project.code} role="site-personnel" label="Site Personnel" readOnly={!canEdit} />
        )}
        <TeamMemberPanel projectCode={project.code} role="consultant" label="Consultants" readOnly={!canEdit} />
      </div>

      {/* One Design section: who owns the stage, the designs the architect has
          submitted (with the files attached to each), and any further files
          filed against the stage. The designs used to sit in a separate
          "Linked designs" card, so the architect's submitted files never
          showed up under "Design stage files". */}
      {isDesignProject && (
        <div className="max-w-4xl">
          <PlanSetsSection projectCode={project.code} />
        </div>
      )}

      <div className="max-w-4xl">
        <DesignStageSection projectCode={project.code} canManage={canEdit} canRemove={DOCUMENT_REMOVERS.includes(role)} />
      </div>

      {/* Design change history (design_revisions): version-to-version log per design. Read-only; the panel handles its own loading, errors and empty states. */}
      <div className="max-w-4xl">
        <ProjectRevisionsPanel projectCode={project.code} projectStatus={project.status} />
      </div>

      {/* Owner, contractor and others outside the company: RFIs and RFAs are sent to them. */}
      <div className="max-w-4xl">
        <StakeholdersPanel projectCode={project.code} canManage={role === "project-manager" || role === "admin"} />
      </div>

      {/* RFI / RFA requests on this project (an open one blocks closing it). */}
      <div className="max-w-4xl">
        <ProjectRequestsSection projectCode={project.code} />
      </div>

      {/* Draft plan from an approved proposal (decision support: the PM accepts item by item).
          Read access mirrors GET /api/plan-suggestions; only the PM and Admin act. */}
      {["project-manager", "admin", "architect", "consultant", "owner"].includes(role) && (
        <div className="max-w-4xl">
          <SuggestedPlanPanel projectCode={project.code} canAct={role === "project-manager" || role === "admin"} />
        </div>
      )}

      {/* Requirements and milestones feed the Pre-Construction/Construction gates,
          which a Design project never reaches — hidden there. */}
      {!isDesignProject && (
        <>
          <div className="max-w-4xl">
            {/* F1: matches requirements/service.ts assertCanSetStatus exactly —
                project-manager or admin, not the broader PROJECT_EDITORS set
                (it-designer can edit the project record but can't decide a
                requirement, and would just 403 on click). */}
            <RequirementsPanel
              projectCode={project.code}
              canDecide={role === "project-manager" || role === "admin"}
            />
          </div>

          <div className="max-w-4xl">
            <MilestonesPanel projectCode={project.code} canManage={canEdit} />
          </div>
        </>
      )}

      {/* Was inside the top info grid, above the Team and Milestones
          sections — on a real project it saved somewhere in the middle of
          the page instead of after everything there is to change. */}
      {canEdit && (
        <div className="max-w-4xl">
          <Button onClick={save} disabled={saving || deleting}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
        </TabsContent>
        <TabsContent value="reports" className="max-w-4xl">
          <ReportsTab projectCode={project.code} canUpload={role === "project-manager" || role === "admin"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeamMemberPanel({
  projectCode,
  role,
  label,
  description,
  readOnly = false,
}: {
  projectCode: string;
  role: ProjectMemberRole;
  label: string;
  description?: string;
  readOnly?: boolean;
}) {
  const { members, loading, error, saving, addMember, removeMember } = useProjectMembers(projectCode, role);
  const pgMembers = usePagination(members, 8);
  const { users: candidates } = useUsersByRole(role, { enabled: !readOnly });
  const [selected, setSelected] = useState("");

  const availableToAdd = useMemo(
    () => candidates.filter((u) => !members.some((m) => m.userId === u.id)),
    [candidates, members],
  );

  const handleAdd = async () => {
    const user = candidates.find((u) => String(u.id) === selected);
    if (!user) return;
    const ok = await addMember(user.id, user.name);
    if (ok) setSelected("");
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <HardHat className="h-4 w-4 text-muted-foreground" />
          {label}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <SearchableSelect
              value={selected || undefined}
              onValueChange={setSelected}
              options={availableToAdd.map((u) => ({ value: String(u.id), label: u.name, description: u.email }))}
              placeholder={`Select a ${label.toLowerCase().replace(/s$/, "")}`}
              searchPlaceholder="Search people…"
              emptyText="No more people to add"
            />
          </div>
          <Button size="sm" disabled={!selected || saving} onClick={handleAdd}>
            <UserPlus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive-strong">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one assigned yet.</p>
      ) : (
        <ul className="space-y-2">
          {pgMembers.pageItems.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-2 text-sm">
              <span className="font-medium">{m.userName}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  disabled={saving}
                  className="text-muted-foreground hover:text-destructive-strong"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
          <div className="pt-2">
            <DataTablePagination {...pgMembers} compact />
          </div>
        </ul>
      )}
    </div>
  );
}

/** H1: Design stage — the assigned engineer(s) (read-only reflection of the
 * Engineers TeamMemberPanel above, which is the actual source of truth via
 * project_members) plus documents filed specifically against stage="Design". */
function DesignStageSection({
  projectCode,
  canManage,
  canRemove,
}: {
  projectCode: string;
  canManage: boolean;
  canRemove: boolean;
}) {
  const { members: engineers, loading: engineersLoading } = useProjectMembers(projectCode, "engineer");
  const { designs, loading: designsLoading, error: designsError } = useProjectDesigns(projectCode);
  const pgDesigns = usePagination(designs, 8);
  const [designFileError, setDesignFileError] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const pgDocs = usePagination(docs, 8);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<DocumentRecord | null>(null);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    setDocsError(null);
    try {
      await documentsRepository.remove(pendingRemoval.id);
      setPendingRemoval(null);
      loadDocs();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to delete document");
      setPendingRemoval(null);
    } finally {
      setRemoving(false);
    }
  };

  const loadDocs = () => {
    setDocsLoading(true);
    setDocsError(null);
    documentsRepository
      .listByProject(projectCode, { stage: "Design" })
      .then((res) => setDocs(res.data))
      .catch((err: unknown) => setDocsError(err instanceof Error ? err.message : "Failed to load documents"))
      .finally(() => setDocsLoading(false));
  };

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setDocsError(null);
    try {
      await documentsRepository.upload({ file, project: projectCode, type: "Design", stage: "Design" });
      loadDocs();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <PencilRuler className="h-4 w-4 text-muted-foreground" />
          Design stage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assigned engineer(s), the designs submitted by the architect, and files filed against the Design stage.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Assigned engineer(s)</p>
        {engineersLoading ? (
          <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
        ) : engineers.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No engineer staffed yet — add one in the Engineers panel above.
          </p>
        ) : (
          <p className="mt-1 text-sm">{engineers.map((m) => m.userName).join(", ")}</p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Submitted designs</p>
        {designsError && <p className="mt-2 text-sm text-destructive-strong">{designsError}</p>}
        {designFileError && <p role="alert" className="mt-2 text-sm text-destructive-strong">{designFileError}</p>}
        {designsLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : designs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No design has been submitted for this project yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pgDesigns.pageItems.map((d) => (
              <li key={d.id} className="space-y-2 rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/designs/${d.id}`} className="min-w-0 hover:underline">
                    <div className="truncate text-sm font-medium">{d.name}</div>
                    <div className="font-mono text-overline text-muted-foreground">
                      {d.code} · {d.discipline} · submitted by {d.leadArchitect}
                    </div>
                  </Link>
                  <StatusBadge status={d.status} />
                </div>
                {(d.fileUrls ?? []).length > 0 && (
                  <ul className="space-y-1">
                    {(d.fileUrls ?? []).map((f) => (
                      <li key={f.url} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{f.name}</span>
                          <FileIntegrityBadge url={f.url} />
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-xs text-primary-strong hover:underline"
                          onClick={() =>
                            void downloadFileUrl(f.url, f.name).catch((err: unknown) =>
                              setDesignFileError(
                                err instanceof Error && /404|not found/i.test(err.message)
                                  ? `"${f.name}" is no longer in storage — ask the architect to attach it again.`
                                  : err instanceof Error ? err.message : "Could not download the file",
                              ),
                            )
                          }
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <div className="pt-2">
              <DataTablePagination {...pgDesigns} compact />
            </div>
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Other Design stage files</p>
          {canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload"}
              </Button>
            </>
          )}
        </div>

        {docsError && <p className="mt-2 text-sm text-destructive-strong">{docsError}</p>}

        <ConfirmDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => !open && setPendingRemoval(null)}
          title={`Delete ${pendingRemoval?.title ?? "this file"}?`}
          description="The file is permanently removed from the project and cannot be recovered. The deletion is recorded in the audit trail."
          confirmLabel="Delete"
          loading={removing}
          onConfirm={() => void confirmRemoval()}
        />

        {docsLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No other files filed against the Design stage.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pgDocs.pageItems.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {d.fileUrl && <FileIntegrityBadge url={d.fileUrl} />}
                  {d.fileUrl && (
                    // A bare <a href> to the stored URL opened the login page
                    // in a new tab — files are private, so the click fetches
                    // them with the caller's token instead (lib/file-url).
                    <button
                      type="button"
                      className="text-xs text-primary-strong hover:underline"
                      onClick={() =>
                        void downloadFileUrl(d.fileUrl, d.title.includes(".") ? d.title : undefined).catch((err: unknown) =>
                          setDocsError(err instanceof Error ? err.message : "Could not open the file"),
                        )
                      }
                    >
                      Download
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive-strong"
                      title="Delete file"
                      aria-label={`Delete ${d.title}`}
                      onClick={() => setPendingRemoval(d)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
            <div className="pt-2">
              <DataTablePagination {...pgDocs} compact />
            </div>
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}><Label>{label}</Label>{children}</div>;
}

/** A field the current role cannot change: the value, not a disabled input. */
function ReadOnlyValue({
  value,
  mono = false,
  multiline = false,
}: {
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
}) {
  if (!value) {
    return <p className="py-1.5 text-sm text-muted-foreground">Not recorded</p>;
  }
  return (
    <p
      className={[
        "py-1.5 text-sm",
        mono ? "font-mono" : "",
        multiline ? "whitespace-pre-wrap break-words" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value}
    </p>
  );
}
