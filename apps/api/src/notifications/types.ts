export interface NotificationRecord {
  id: number;
  recipientRole: string | null;
  recipientUserId: number | null;
  projectCode: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date | null;
}

export interface CreateNotificationInput {
  // Role-addressed when recipientUserId is omitted (every holder of this
  // role sees it); aimed at one person when it's set.
  recipientRole?: string;
  recipientUserId?: number;
  projectCode?: string;
  title: string;
  body: string;
  link?: string;
}

/** Scopes a GET to the caller — never an arbitrary role from the query string. */
export interface NotificationScope {
  userId: number;
  role: string;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
}