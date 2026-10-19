import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { apiClient } from "@/services/api.client";
import { useAuth } from "@/auth/auth-context";
import { formatBytes, getMaxUploadBytes, uploadLargeFile } from "@/features/uploads/lib/upload-file";

export interface DesignFileUpload {
  name: string;
  url: string;
}

/** One engineer assigned to a design — mirrors the API's AssignedEngineer. */
export interface DesignEngineer {
  userId: number;
  userName: string;
}

export interface DesignFormData {
  name: string;
  code: string;
  projectCode: string;
  discipline: string;
  category: string;
  client: string;
  building: string;
  floor: string;
  zone: string;
  version: string;
  revision: number;
  phase: string;
  status: string;
  leadArchitect: string;
  // A design can be reviewed by several engineers at once (structural + MEP
  // + civil on one drawing set) — backed by the design_engineers join table.
  assignedEngineers: DesignEngineer[];
  fileCount: number;
  fileUrls: DesignFileUpload[];
  aiCompleteness: number;
  aiConfidence: number;
  description: string;
}

const initialForm: DesignFormData = {
  name: "",
  code: "",
  projectCode: "",
  discipline: "",
  category: "",
  client: "",
  building: "",
  floor: "",
  zone: "",
  version: "v0.1",
  revision: 0,
  phase: "Design Development",
  status: "Draft",
  leadArchitect: "",
  assignedEngineers: [],
  fileCount: 0,
  fileUrls: [],
  aiCompleteness: 0,
  aiConfidence: 0,
  description: "",
};

const generateDesignCode = () => {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DSN-${new Date().getFullYear()}-${rand}`;
};

export const useDesignCreateController = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<DesignFormData>({
    ...initialForm,
    code: generateDesignCode(),
    leadArchitect: user?.name ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The file currently uploading and how far along it is (0-100).
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [maxUploadLabel, setMaxUploadLabel] = useState<string | null>(null);
  useEffect(() => {
    getMaxUploadBytes()
      .then((bytes) => setMaxUploadLabel(formatBytes(bytes)))
      .catch(() => setMaxUploadLabel(null));
  }, []);

  const set = <K extends keyof DesignFormData>(key: K, value: DesignFormData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const regenerateCode = () => set("code", generateDesignCode());

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded: DesignFileUpload[] = [];
      const failures: string[] = [];
      // One bad file (too large, wrong type) must not throw away the others.
      for (const file of Array.from(files)) {
        setUploadProgress({ name: file.name, pct: 0 });
        try {
          const result = await uploadLargeFile(file, (pct) => setUploadProgress({ name: file.name, pct }));
          uploaded.push({ name: file.name, url: result.url });
        } catch (err) {
          failures.push(err instanceof Error ? err.message : `${file.name}: upload failed`);
        }
      }
      if (uploaded.length > 0) {
        setData((prev) => ({
          ...prev,
          fileUrls: [...prev.fileUrls, ...uploaded],
          fileCount: prev.fileCount + uploaded.length,
        }));
      }
      if (failures.length > 0) setUploadError(failures.join(" "));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const removeFile = (url: string) => {
    setData((prev) => ({
      ...prev,
      fileUrls: prev.fileUrls.filter((f) => f.url !== url),
      fileCount: Math.max(0, prev.fileCount - 1),
    }));
  };

  const stepErrors = useMemo(() => {
    const e: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (!data.name.trim() || data.name.trim().length < 2) e[1].push("Design name is required");
    if (!data.discipline) e[1].push("Select a discipline");
    if (!data.category) e[1].push("Select a category");
    if (!data.projectCode.trim()) e[2].push("Project code is required");
    if (!data.version.trim()) e[3].push("Version is required");
    if (!data.leadArchitect.trim()) e[4].push("Lead architect is required");
    return e;
  }, [data]);

  const canAdvance = stepErrors[step].length === 0;

  const next = () => {
    if (!canAdvance) return false;
    setStep((s) => Math.min(s + 1, 6));
    return true;
  };
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...data };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await apiClient.post("/designs", payload);
      navigate(`/designs/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design.");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    step,
    setStep,
    data,
    set,
    regenerateCode,
    submitting,
    error,
    stepErrors,
    canAdvance,
    next,
    back,
    submit,
    uploading,
    uploadError,
    uploadFiles,
    uploadProgress,
    maxUploadLabel,
    removeFile,
  };
};
