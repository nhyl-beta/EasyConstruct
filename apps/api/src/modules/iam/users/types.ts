export interface PublicUserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  /** Paged account list only: the linked employee's code (e.g. EMP-014), null when unlinked. */
  employeeCode?: string | null;
  /** Paged account list only: the linked employee's status, so a deactivated employee with a live account shows up. */
  employeeStatus?: string | null;
  /** Paged account list only: the employee's name. */
  employeeName?: string | null;
}

export interface UserFilters {
  role?: string;
  /** Name or email contains this text (paged lists only). */
  search?: string;
}

/** An account is always created FROM an employee: name and email come from that record. */
export interface CreateUserInput {
  employeeId: number;
  password: string;
  role: string;
}

/** What the repository inserts (the name and email were copied from the employee). */
export interface NewAccountRow {
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
