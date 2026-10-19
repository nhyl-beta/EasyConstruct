import type {
  StageStatus,
  Workflow,
  WorkflowStage,
  WorkflowStatus,
} from "../types/workflow.types";

const STORAGE_KEY = "easyconstruct_workflows";

function loadWorkflows(): Workflow[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored) as Workflow[];
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: Workflow[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

export async function getWorkflows(): Promise<Workflow[]> {
  return loadWorkflows();
}

export async function getWorkflowsForRole(
  role: string,
): Promise<Workflow[]> {
  const workflows = loadWorkflows();

  return workflows.filter((workflow) => {
    const createdByRole = workflow.createdBy === role;

    const assignedToRole = workflow.stages.some(
      (stage) =>
        stage.role === role ||
        stage.roleLabel === role ||
        stage.assignedTo === role,
    );

    return createdByRole || assignedToRole;
  });
}

export async function createWorkflow(
  input: Omit<
    Workflow,
    | "id"
    | "code"
    | "createdAt"
    | "updatedAt"
    | "status"
    | "stages"
  > & {
    stages: WorkflowStage[];
  },
): Promise<Workflow> {
  const workflows = loadWorkflows();
  const now = new Date().toISOString();

  const nextId =
    workflows.length > 0
      ? Math.max(...workflows.map((workflow) => workflow.id)) + 1
      : 1;

  const code = `WF-${String(nextId).padStart(3, "0")}`;

  const stages: WorkflowStage[] = input.stages.map(
    (stage, index): WorkflowStage => ({
      ...stage,
      status: (index === 0 ? "current" : "upcoming") as StageStatus,
      createdAt: stage.createdAt ?? now,
    }),
  );

  const workflow: Workflow = {
    ...input,
    id: nextId,
    code,
    status: "active",
    stages,
    createdAt: now,
    updatedAt: now,
  };

  workflows.push(workflow);
  saveWorkflows(workflows);

  return workflow;
}

export async function updateWorkflowStatus(
  id: number,
  status: WorkflowStatus,
  comment?: string,
): Promise<Workflow | null> {
  const workflows = loadWorkflows();

  const index = workflows.findIndex(
    (workflow) => workflow.id === id,
  );

  if (index === -1) {
    return null;
  }

  const workflow = workflows[index];

  let updatedStages = workflow.stages;

  if (comment) {
    updatedStages = workflow.stages.map((stage) => {
      if (stage.status !== "current") {
        return stage;
      }

      return {
        ...stage,
        comments: comment,
      };
    });
  }

  const updatedWorkflow: Workflow = {
    ...workflow,
    status,
    stages: updatedStages,
    updatedAt: new Date().toISOString(),
  };

  workflows[index] = updatedWorkflow;
  saveWorkflows(workflows);

  return updatedWorkflow;
}
