export interface AuditLogRecord {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  summary: string | null;
  projectCode: string | null;
  createdAt: Date | null;
}

export interface CreateAuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  summary?: string;
  projectCode?: string;
}

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  projectCode?: string;
  /** Only these actions (for example the sensitive ones on the Security screen). */
  actions?: string[];
  // D1: server-side search/filter/pagination for the admin activity log.
  search?: string;
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}

export interface AuditLogFacets {
  entityTypes: string[];
  actors: string[];
}