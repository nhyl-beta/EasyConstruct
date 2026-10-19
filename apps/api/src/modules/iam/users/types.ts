export interface PublicUserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface UserFilters {
  role?: string;
  /** Name or email contains this text (paged lists only). */
  search?: string;
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

export interface SetUserStatusInput {
  isActive: boolean;
}

export interface SetUserPasswordInput {
  password: string;
}
