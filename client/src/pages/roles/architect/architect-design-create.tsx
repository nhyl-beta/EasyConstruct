import { useState } from "react";
import { useNavigate } from "react-router";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiStepPage, type Step } from "@/components/ui/multi-step-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/shared/project-picker";
import { ReferencePicker } from "@/features/reference/components/ReferencePicker";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { clientToPrefill } from "@/features/designs/lib/prefill-client";
import { Paperclip, X } from "lucide-react";
import {
  useDesignCreate,
  type DesignFormData,
} from "@/features/designs/hooks/useDesignCreate.ts";
import { useProjectMembers } from "@/features/project-members/hooks/use-project-members";
import { openFileUrl } from "@/lib/file-url";
import { Checkbox } from "@/components/ui/checkbox";

const STEPS: Step[] = [
  {
    number: 1,
    title: "Basic information",
    subtitle: "Design name & discipline",
  },
  {
    number: 2,
    title: "Project information",
    subtitle: "Linked project & location",
  },
  {
    number: 3,
    title: "Version information",
    subtitle: "Version, phase & status",
  },
  { number: 4, title: "Team", subtitle: "Lead architect" },
  { number: 5, title: "Files", subtitle: "Expected drawing count" },
  {
    number: 6,
    title: "Review & submit",
    subtitle: "Confirm and create design",
  },
];

export default function ArchitectDesignCreate() {
  const navigate = useNavigate();
  const c = useDesignCreate();
  const [stepError, setStepError] = useState<string | null>(null);

  const handleNext = () => {
    const advanced = c.next();
    setStepError(advanced ? null : c.stepErrors[c.step].join(" · "));
  };
  
  const handleBack = () => {
    setStepError(null);
    c.back();
  };
  return (
    <MultiStepPage
      title="New design"
      description="Register a new design and link it to a project."
      steps={STEPS}
      currentStep={c.step}
      onNext={handleNext}
      onBack={handleBack}
      onCancel={() => navigate(-1)}
      onSubmit={c.submit}
      isLastStep={c.step === STEPS.length}
      isFirstStep={c.step === 1}
      submitting={c.submitting}
      submitLabel="Create Design"
      error = {stepError ?? c.error}
    >
      {c.step === 1 && (
        <StepBasics
          data={c.data}
          set={c.set}
          errors={c.stepErrors[1]}
          code={c.data.code}
          onRegenerate={c.regenerateCode}
        />
      )}
      {c.step === 2 && (
        <StepProject data={c.data} set={c.set} errors={c.stepErrors[2]} />
      )}
      {c.step === 3 && (
        <StepVersion data={c.data} set={c.set} errors={c.stepErrors[3]} />
      )}
      {c.step === 4 && (
        <StepTeam data={c.data} set={c.set} errors={c.stepErrors[4]} />
      )}
      {c.step === 5 && (
        <StepFiles
          data={c.data}
          uploading={c.uploading}
          uploadError={c.uploadError}
          uploadProgress={c.uploadProgress}
          maxUploadLabel={c.maxUploadLabel}
          onUpload={c.uploadFiles}
          onRemove={c.removeFile}
        />
      )}
      {c.step === 6 && <StepReview data={c.data} />}
    </MultiStepPage>
  );
}

type SetFn = <K extends keyof DesignFormData>(
  key: K,
  value: DesignFormData[K],
) => void;

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="text-xs text-destructive-strong">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

function StepBasics({
  data,
  set,
  errors,
  code,
  onRegenerate,
}: {
  data: DesignFormData;
  set: SetFn;
  errors: string[];
  code: string;
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Basic information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-generated code <span className="font-mono">{code}</span>{" "}
          <button
            type="button"
            className="text-primary-strong underline-offset-2 hover:underline"
            onClick={onRegenerate}
          >
            regenerate
          </button>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2 space-y-1.5">
          <Label>
            Design name <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            value={data.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Westgate Tower · Floor 14"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Discipline <span className="text-destructive-strong">*</span>
          </Label>
          <Select
            value={data.discipline}
            onValueChange={(v) => set("discipline", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select discipline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Architectural">Architectural</SelectItem>
              <SelectItem value="Structural">Structural</SelectItem>
              <SelectItem value="MEP">MEP</SelectItem>
              <SelectItem value="Civil">Civil</SelectItem>
              <SelectItem value="Interior">Interior</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>
            Category <span className="text-destructive-strong">*</span>
          </Label>
          <Select
            value={data.category}
            onValueChange={(v) => set("category", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Floor Plan">Floor Plan</SelectItem>
              <SelectItem value="Elevation">Elevation</SelectItem>
              <SelectItem value="Section">Section</SelectItem>
              <SelectItem value="Detail">Detail</SelectItem>
              <SelectItem value="Facade">Facade</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Design intent, scope, notes…"
            className="h-28 resize-none"
            maxLength={500}
          />
        </div>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}

function StepProject({
  data,
  set,
  errors,
}: {
  data: DesignFormData;
  set: SetFn;
  errors: string[];
}) {
  const { projects } = useProjects();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Project information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Which project and location this design belongs to.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Project code <span className="text-destructive-strong">*</span>
          </Label>
          <ProjectPicker
            value={data.projectCode}
            onChange={(v) => {
              set("projectCode", v);
              // Fill the Client from the project, unless one was already chosen.
              const fill = clientToPrefill(data.client, projects.find((p) => p.code === v));
              if (fill) set("client", fill);
            }}
            className="w-full"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Client</Label>
          {/* The design stores the client name only (no client id column); the picker keeps the
              spelling shared with projects. The Architect can pick but not add: adding a client is
              for the roles that create projects (server: POST /api/reference/clients). */}
          <ReferencePicker
            kind="clients"
            value={data.client}
            onChange={(name) => set("client", name)}
            canAdd={false}
            placeholder="Select a client"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Building</Label>
          <Input
            value={data.building}
            onChange={(e) => set("building", e.target.value)}
            placeholder="Tower A"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Floor</Label>
          <Input
            value={data.floor}
            onChange={(e) => set("floor", e.target.value)}
            placeholder="14"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Zone</Label>
          <Input
            value={data.zone}
            onChange={(e) => set("zone", e.target.value)}
            placeholder="North"
           
          />
        </div>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}

function StepVersion({
  data,
  set,
  errors,
}: {
  data: DesignFormData;
  set: SetFn;
  errors: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Version information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Version, construction phase, and current status.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Version <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            value={data.version}
            onChange={(e) => set("version", e.target.value)}
            placeholder="v0.1"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Revision number</Label>
          <Input
            type="number"
            min={0}
            value={data.revision}
            onChange={(e) => set("revision", Number(e.target.value) || 0)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phase</Label>
          <Select value={data.phase} onValueChange={(v) => set("phase", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Schematic Design">Schematic Design</SelectItem>
              <SelectItem value="Design Development">
                Design Development
              </SelectItem>
              <SelectItem value="Construction Documents">
                Construction Documents
              </SelectItem>
              <SelectItem value="Construction">Construction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={data.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="In Review">In Review</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Revision Needed">Revision Needed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}

function StepTeam({
  data,
  set,
  errors,
}: {
  data: DesignFormData;
  set: SetFn;
  errors: string[];
}) {
  const { members: engineers, loading: engineersLoading } = useProjectMembers(
    data.projectCode || null,
    "engineer",
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Team</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead architect, plus an engineer from the pool the Project Manager
          has made available on this project.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Lead architect <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            value={data.leadArchitect}
            onChange={(e) => set("leadArchitect", e.target.value)}
            placeholder="e.g. M. Rivera"
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Assigned engineers</Label>
          {!data.projectCode ? (
            <p className="text-xs text-muted-foreground">
              Pick a project first (Step 2).
            </p>
          ) : (
            // Checkbox list rather than a Select: a design routinely needs
            // several engineers (structural + MEP + civil), and the project's
            // engineer roster is short enough to show in full.
            <div className="space-y-2 rounded-xl border border-border p-3">
              {engineersLoading && (
                <p className="text-xs text-muted-foreground">Loading engineers…</p>
              )}
              {!engineersLoading && engineers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No engineers available on this project yet — ask the PM to add one.
                </p>
              )}
              {engineers.map((e) => {
                const checked = data.assignedEngineers.some(
                  (a) => a.userId === e.userId,
                );
                return (
                  <label
                    key={e.userId}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        set(
                          "assignedEngineers",
                          next
                            ? [
                                ...data.assignedEngineers,
                                { userId: e.userId, userName: e.userName },
                              ]
                            : data.assignedEngineers.filter(
                                (a) => a.userId !== e.userId,
                              ),
                        )
                      }
                    />
                    {e.userName}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}

function StepFiles({
  data,
  uploading,
  uploadError,
  uploadProgress,
  maxUploadLabel,
  onUpload,
  onRemove,
}: {
  data: DesignFormData;
  uploading: boolean;
  uploadError: string | null;
  uploadProgress: { name: string; pct: number } | null;
  maxUploadLabel: string | null;
  onUpload: (files: FileList | File[]) => Promise<void>;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Files</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload floor plans, drawing sheets or supporting files (PDF, DWG/DXF, Office documents or images
          {maxUploadLabel ? `, up to ${maxUploadLabel} each` : ""}).
        </p>
      </div>
      <div className="space-y-3">
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm hover:border-primary/40">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {uploading ? "Uploading…" : "Choose files"}
          <input
            type="file"
            multiple
            accept=".pdf,.dwg,.dxf,.rvt,.ifc,.skp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files?.length) void onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {uploadProgress && (
          <div className="space-y-1" role="status" aria-live="polite">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate">{uploadProgress.name}</span>
              <span className="tabular-nums">{uploadProgress.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress.pct}%` }} />
            </div>
          </div>
        )}

        {uploadError && (
          <p role="alert" className="text-xs text-destructive-strong">
            {uploadError}
          </p>
        )}

        {data.fileUrls.length > 0 && (
          <ul className="space-y-1.5">
            {data.fileUrls.map((f) => (
              <li
                key={f.url}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => void openFileUrl(f.url).catch(() => undefined)}
                  className="truncate text-left text-primary-strong underline-offset-2 hover:underline"
                >
                  {f.name}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(f.url)}
                  className="shrink-0 text-muted-foreground hover:text-destructive-strong"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{data.fileCount} file(s) attached</p>
      </div>
    </div>
  );
}

function StepReview({ data }: { data: DesignFormData }) {
  const rows: [string, string][] = [
    ["Design name", data.name || "—"],
    ["Code", data.code],
    ["Project code", data.projectCode || "—"],
    ["Discipline", data.discipline || "—"],
    ["Category", data.category || "—"],
    ["Version", `${data.version} · rev ${data.revision}`],
    ["Phase", data.phase],
    ["Status", data.status],
    ["Lead architect", data.leadArchitect || "—"],
    [
      "Assigned engineers",
      data.assignedEngineers.map((e) => e.userName).join(", ") || "—",
    ],
    ["File count", `${data.fileCount}`],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Review & confirm</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This will create a real design record via the API.
        </p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-muted/30">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between px-5 py-3 text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

ArchitectDesignCreate.displayName = "ArchitectDesignCreate";
