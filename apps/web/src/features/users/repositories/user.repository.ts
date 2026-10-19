import { apiClient } from "@/services/api.client";

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const UserRepository = {
  async list(): Promise<PublicUser[]> {
    return unwrap<PublicUser[]>(apiClient.get("/users"));
  },

  async listByRole(role: string): Promise<PublicUser[]> {
    return unwrap<PublicUser[]>(apiClient.get(`/users?role=${encodeURIComponent(role)}`));
  },

  async create(input: CreateUserInput): Promise<PublicUser> {
    return unwrap<PublicUser>(apiClient.post("/users", input));
  },

  async update(id: number, input: UpdateUserInput): Promise<PublicUser> {
    return unwrap<PublicUser>(apiClient.patch(`/users/${id}`, input));
  },

  // Administrative reset — IT Designer sets a new password without needing
  // the current one. The account holder's own path stays the sign-in page's
  // "Forgot password" link (POST /auth/forgot-password).
  async setPassword(id: number, password: string): Promise<PublicUser> {
    return unwrap<PublicUser>(apiClient.patch(`/users/${id}/password`, { password }));
  },

  async setActive(id: number, isActive: boolean): Promise<PublicUser> {
    return unwrap<PublicUser>(apiClient.patch(`/users/${id}/status`, { isActive }));
  },

  // Permanent. The API refuses unless the account is already deactivated and
  // nothing references it — see apps/api/src/users/service.ts remove().
  async remove(id: number): Promise<PublicUser> {
    return unwrap<PublicUser>(apiClient.del(`/users/${id}`));
  },
};
