export interface AuditLog {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  summary: string | null;
  // K3: nullable — many entries (auth, user/role/template admin) have no
  // single project to attach to.
  projectCode: string | null;
  createdAt: string | null;
}

export interface AuditLogsQuery {
  entityType?: string;
  entityId?: string;
  projectCode?: string;
  /** Only these actions (the Security screen asks for the sensitive ones). */
  actions?: string[];
  // D1: server-side search/filter/pagination.
  search?: string;
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}

export interface AuditLogsResult {
  data: AuditLog[];
  total: number;
}

export interface AuditLogFacets {
  entityTypes: string[];
  actors: string[];
}

/** GET /api/audit-logs/security-overview */
export interface SecurityOverview {
  /** One entry per person with a sign-in inside the token lifetime. */
  sessions: AuditLog[];
  /** The newest `failedLoginsLimit` failed attempts. */
  failedLogins: AuditLog[];
  /** Every failed attempt on record — can exceed failedLogins.length. */
  totalFailedLogins: number;
  failedLoginsLimit: number;
}
