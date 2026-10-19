import { apiClient } from "@/services/api.client";

export type ProjectMemberRole = "engineer" | "architect" | "site-personnel" | "consultant";

export interface ProjectMember {
  id: number;
  projectCode: string;
  userId: number;
  userName: string;
  role: ProjectMemberRole;
  addedBy: string;
  createdAt: string | null;
}

export interface CreateProjectMemberInput {
  projectCode: string;
  userId: number;
  userName: string;
  role: ProjectMemberRole;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const ProjectMemberRepository = {
  async listForProject(projectCode: string): Promise<ProjectMember[]> {
    return unwrap<ProjectMember[]>(
      apiClient.get(`/project-members?projectCode=${encodeURIComponent(projectCode)}`),
    );
  },

  async listForUser(userId: number): Promise<ProjectMember[]> {
    return unwrap<ProjectMember[]>(
      apiClient.get(`/project-members?userId=${userId}`),
    );
  },

  async create(input: CreateProjectMemberInput): Promise<ProjectMember> {
    return unwrap<ProjectMember>(apiClient.post("/project-members", input));
  },

  async remove(id: number): Promise<ProjectMember> {
    return unwrap<ProjectMember>(apiClient.del(`/project-members/${id}`));
  },
};
