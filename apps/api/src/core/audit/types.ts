export interface CreateAuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  summary?: string;
  projectCode?: string;
}

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

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  projectCode?: string;
  actions?: string[];
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
