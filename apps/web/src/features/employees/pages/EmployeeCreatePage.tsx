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
import { Info, Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDepartments } from "../hooks/use-departments";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  EMPLOYEE_DOCUMENT_TYPES,
  addEmployeeDocument,
  createEmployee,
  getEmployee,
  listEmployeeDocuments,
  removeEmployeeDocument,
  updateEmployee,
  type EmployeeDocumentType,
} from "@/features/hr/hr-api";
import { uploadLargeFile } from "@/features/uploads/lib/upload-file";
import { openFileUrl } from "@/lib/file-url";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorCode } from "@/lib/api-error";

type EmployeeStatus = "Active" | "On Leave" | "Suspended" | "Archived";

const STEPS: Step[] = [
  {
    number: 1,
    title: "Personal information",
    subtitle: "Basic employee details",
  },
  {
    number: 2,
    title: "Employment details",
    subtitle: "Role, department, and pay",
  },
  { number: 3, title: "Review & confirm", subtitle: "Review and add employee" },
  { number: 4, title: "Documents", subtitle: "Resume, certificates, other files" },
];

/** A file HR attached: already saved on the employee (has an id) or waiting for Save. */
interface DocDraft {
  id?: number;
  docType: EmployeeDocumentType;
  name: string;
  url: string;
}

interface EmployeeFormData {
  firstName: string;
  lastName: string;
  employeeId: string;
  role: string;
  department: string;
  status: EmployeeStatus;
  hiredOn: string;
  email: string;
  phone: string;
  rate: string;
  rateType: string;
}

const initialForm: EmployeeFormData = {
  firstName: "",
  lastName: "",
  employeeId: "",
  role: "",
  department: "",
  status: "Active",
  hiredOn: "",
  email: "",
  phone: "",
  rate: "",
  rateType: "Monthly",
};

export default function EmployeeCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const [step, setStep] = useState(1);
  const [data, setData] = useState<EmployeeFormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocDraft[]>([]);
  const [removedDocIds, setRemovedDocIds] = useState<number[]>([]);

  useEffect(() => {
    if (!editingId) return;
    void listEmployeeDocuments(editingId).then(setDocs).catch(() => setDocs([]));
    void getEmployee(editingId)
      .then((employee) => {
        const [firstName, ...lastParts] = employee.name.split(" ");
        setData({
          firstName,
          lastName: lastParts.join(" "),
          employeeId: employee.id,
          role: employee.role,
          department: employee.department,
          status: employee.status,
          hiredOn: employee.hiredOn,
          email: employee.email ?? "",
          phone: (employee.phone ?? "").replace(/\D/g, ""), // older records hold dashes or a +; the field is digits only
          rate: employee.payRate,
          rateType: employee.rateType,
        });
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load employee."));
  }, [editingId]);

  const set = <K extends keyof EmployeeFormData>(
    key: K,
    value: EmployeeFormData[K],
  ) => setData((prev) => ({ ...prev, [key]: value }));

  const handleCancel = () => navigate("/employees");

  // Fix 1.2: set when the server finds an employee with the same or a very similar name.
  const [duplicateName, setDuplicateName] = useState<string | null>(null);

  const handleSubmit = async (confirmDuplicate = false) => {
    // B-118: the field already strips non-digits as you type, but nothing
    // stopped submitting a too-short number (e.g. "1234"). Phone is
    // optional, so only a non-empty value is held to the PH mobile format.
    if (data.phone && data.phone.length !== 11) {
      setError("Phone number must be 11 digits (e.g. 09171234567).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        employeeId: data.employeeId,
        name: `${data.firstName} ${data.lastName}`.trim(),
        role: data.role,
        department: data.department,
        status: data.status,
        hiredOn: data.hiredOn,
        email: data.email,
        phone: data.phone,
        payRate: data.rate ? Number(data.rate) : 0,
        rateType: data.rateType,
      };
      const saved = editingId
        ? await updateEmployee(editingId, input)
        : await createEmployee(confirmDuplicate ? { ...input, confirmDuplicate: true } : input);
      // The employee exists now, so the documents can be attached to it. A failure here must not look like the
      // employee was not saved (a retry would create a duplicate).
      const employeeKey = editingId ?? saved.dbId;
      try {
        for (const id of removedDocIds) await removeEmployeeDocument(employeeKey, id);
        for (const doc of docs.filter((d) => !d.id)) {
          await addEmployeeDocument(employeeKey, { docType: doc.docType, name: doc.name, url: doc.url });
        }
      } catch {
        toast.error("Employee saved, but some documents could not be attached. Open the employee and add them again.");
      }
      navigate("/employees");
    } catch (err) {
      if (errorCode(err) === "DUPLICATE_NAME") {
        setDuplicateName(err instanceof Error ? err.message : "An employee with this name already exists.");
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create employee.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MultiStepPage
      title={editingId ? "Edit employee" : "Add employee"}
      description={editingId ? "Update the employee record and pay details." : "Register a new employee and set up their workspace access."}
      steps={STEPS}
      currentStep={step}
      onNext={() => setStep((s) => Math.min(s + 1, STEPS.length))}
      onBack={() => setStep((s) => Math.max(s - 1, 1))}
      onCancel={handleCancel}
      onSubmit={() => void handleSubmit()}
      isLastStep={step === STEPS.length}
      isFirstStep={step === 1}
      submitting={submitting}
      submitLabel={editingId ? "Save changes ✓" : "Add employee ✓"}
      error={error}
      aiHint="AI can auto-fill employee details from an uploaded ID or contract document."
    >
      {step === 1 && <StepPersonalInfo data={data} set={set} />}
      {step === 2 && <StepEmployment data={data} set={set} />}
      {step === 3 && <StepReview data={data} />}
      {step === 4 && (
        <StepDocuments
          docs={docs}
          onAdd={(added) => setDocs((cur) => [...cur, ...added])}
          onRemove={(doc) => {
            setDocs((cur) => cur.filter((d) => d !== doc));
            if (doc.id) setRemovedDocIds((cur) => [...cur, doc.id!]);
          }}
        />
      )}
      <ConfirmDialog
        open={duplicateName !== null}
        onOpenChange={(open) => !open && setDuplicateName(null)}
        title="An employee with this name already exists"
        description={duplicateName ?? undefined}
        confirmLabel="Add anyway"
        destructive={false}
        loading={submitting}
        onConfirm={() => {
          setDuplicateName(null);
          void handleSubmit(true);
        }}
      />
    </MultiStepPage>
  );
}

// ── Step 1 — Personal Info ────────────────────────────────────────────────────

function StepPersonalInfo({
  data,
  set,
}: {
  data: EmployeeFormData;
  set: <K extends keyof EmployeeFormData>(
    key: K,
    value: EmployeeFormData[K],
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Personal information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the employee's personal details.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            First name <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. Adaeze"
            value={data.firstName}
            onChange={(e) => set("firstName", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Last name <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. Nwosu"
            value={data.lastName}
            onChange={(e) => set("lastName", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input
            type="email"
            placeholder="e.g. a.nwosu@orra.com"
            value={data.email}
            onChange={(e) => set("email", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phone number</Label>
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="e.g. 09171234567"
            value={data.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Employee ID <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. EMP-011"
            value={data.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Hire date <span className="text-destructive-strong">*</span>
          </Label>
          <DatePicker
            value={data.hiredOn}
            onChange={(v) => set("hiredOn", v)}
            placeholder="Select hire date"
            clearable={false}
          />
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-strong" />
        <p className="text-xs text-muted-foreground">
          Employee details are saved to the HR database and are available to
          attendance and payroll workflows.
        </p>
      </div>
    </div>
  );
}

// ── Step 2 — Employment ───────────────────────────────────────────────────────

function StepEmployment({
  data,
  set,
}: {
  data: EmployeeFormData;
  set: <K extends keyof EmployeeFormData>(
    key: K,
    value: EmployeeFormData[K],
  ) => void;
}) {
  const { departments } = useDepartments();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Employment details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the role, department, and pay.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>
            Job title / Role <span className="text-destructive-strong">*</span>
          </Label>
          <Input
            placeholder="e.g. Site Engineer"
            value={data.role}
            onChange={(e) => set("role", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Department <span className="text-destructive-strong">*</span>
          </Label>
          <Select value={data.department} onValueChange={(v) => set("department", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...departments.map((d) => d.name), ...(data.department ? [data.department] : [])])].map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Employment status</Label>
          <Select
            value={data.status}
            onValueChange={(v) => set("status", v as EmployeeStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="On Leave">On Leave</SelectItem>
              <SelectItem value="Suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Pay rate (PHP)</Label>
          <Input
            type="number"
            placeholder="0.00"
            value={data.rate}
            onChange={(e) => set("rate", e.target.value)}
           
          />
        </div>
        <div className="space-y-1.5">
          <Label>Rate type</Label>
          <Select
            value={data.rateType}
            onValueChange={(v) => set("rateType", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Hourly">Hourly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — Review ───────────────────────────────────────────────────────────

function StepReview({ data }: { data: EmployeeFormData }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Review & confirm</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm employee details before adding.
        </p>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-muted/30">
        {[
          {
            label: "Full name",
            value: `${data.firstName} ${data.lastName}`.trim() || "—",
          },
          { label: "Employee ID", value: data.employeeId || "—" },
          { label: "Role", value: data.role || "—" },
          { label: "Department", value: data.department || "—" },
          { label: "Hire date", value: data.hiredOn || "—" },
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

// ── Step 4 — Documents ────────────────────────────────────────────────────────

function StepDocuments({
  docs,
  onAdd,
  onRemove,
}: {
  docs: DocDraft[];
  onAdd: (added: DocDraft[]) => void;
  onRemove: (doc: DocDraft) => void;
}) {
  const [docType, setDocType] = useState<EmployeeDocumentType>("resume");
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (files: FileList | File[]) => {
    setUploadError(null);
    const added: DocDraft[] = [];
    const failures: string[] = [];
    // One bad file (too large, wrong type) must not throw away the others.
    for (const file of Array.from(files)) {
      setProgress({ name: file.name, pct: 0 });
      try {
        const result = await uploadLargeFile(file, (pct) => setProgress({ name: file.name, pct }));
        added.push({ docType, name: file.name, url: result.url });
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `${file.name}: upload failed`);
      }
    }
    setProgress(null);
    if (added.length > 0) onAdd(added);
    if (failures.length > 0) setUploadError(failures.join(" "));
  };

  const typeLabel = (t: string) => EMPLOYEE_DOCUMENT_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Documents</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the resume, curriculum vitae, certificates or any other file needed for employment. This step is optional and can be done later by editing the employee.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Document type</Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as EmployeeDocumentType)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm hover:border-primary/40">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {progress ? "Uploading…" : "Choose files"}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.xls,.xlsx"
            className="hidden"
            disabled={!!progress}
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {progress && (
        <div
          role="progressbar"
          aria-label={`Uploading ${progress.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.pct}
          className="relative h-11 overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          <div className="absolute inset-y-0 left-0 bg-primary/20 transition-all" style={{ width: `${progress.pct}%` }} />
          <div className="relative flex h-full items-center justify-between gap-3 px-4 text-sm">
            <span className="truncate">{progress.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{progress.pct}%</span>
          </div>
        </div>
      )}

      {uploadError && (
        <p role="alert" className="text-xs text-destructive-strong">
          {uploadError}
        </p>
      )}

      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id ?? d.url} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => void openFileUrl(d.url).catch(() => undefined)}
                className="truncate text-left text-primary-strong underline-offset-2 hover:underline"
              >
                {d.name}
              </button>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{typeLabel(d.docType)}</span>
              <button type="button" onClick={() => onRemove(d)} className="shrink-0 text-muted-foreground hover:text-destructive-strong" title="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
