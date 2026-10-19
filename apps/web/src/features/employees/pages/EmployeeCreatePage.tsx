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
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { createEmployee, getEmployee, updateEmployee } from "@/features/hr/hr-api";
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
    subtitle: "Role, department, and site",
  },
  { number: 3, title: "Review & confirm", subtitle: "Review and add employee" },
];

interface EmployeeFormData {
  firstName: string;
  lastName: string;
  employeeId: string;
  role: string;
  department: string;
  site: string;
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
  site: "",
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

  useEffect(() => {
    if (!editingId) return;
    void getEmployee(editingId)
      .then((employee) => {
        const [firstName, ...lastParts] = employee.name.split(" ");
        setData({
          firstName,
          lastName: lastParts.join(" "),
          employeeId: employee.id,
          role: employee.role,
          department: employee.department,
          site: employee.site,
          status: employee.status,
          hiredOn: employee.hiredOn,
          email: employee.email ?? "",
          phone: employee.phone ?? "",
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
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        employeeId: data.employeeId,
        name: `${data.firstName} ${data.lastName}`.trim(),
        role: data.role,
        department: data.department,
        site: data.site,
        status: data.status,
        hiredOn: data.hiredOn,
        email: data.email,
        phone: data.phone,
        payRate: data.rate ? Number(data.rate) : 0,
        rateType: data.rateType,
      };
      if (editingId) await updateEmployee(editingId, input);
      else await createEmployee(confirmDuplicate ? { ...input, confirmDuplicate: true } : input);
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
            placeholder="+63 9XX XXX XXXX"
            value={data.phone}
            onChange={(e) => set("phone", e.target.value)}
           
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
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Employment details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the role, department, and site assignment.
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
              <SelectItem value="Engineering">Engineering</SelectItem>
              <SelectItem value="Field Ops">Field Ops</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="Legal">Legal</SelectItem>
              <SelectItem value="Design">Design</SelectItem>
              <SelectItem value="Safety">Safety</SelectItem>
              <SelectItem value="Project Mgmt">Project Mgmt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>
            Site assignment <span className="text-destructive-strong">*</span>
          </Label>
          <Select value={data.site} onValueChange={(v) => set("site", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Westgate Tower">Westgate Tower</SelectItem>
              <SelectItem value="Harborline Hub">Harborline Hub</SelectItem>
              <SelectItem value="Northgate Plaza">Northgate Plaza</SelectItem>
              <SelectItem value="Phoenix HQ">Phoenix HQ</SelectItem>
              <SelectItem value="HQ">HQ</SelectItem>
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
          { label: "Site", value: data.site || "—" },
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
