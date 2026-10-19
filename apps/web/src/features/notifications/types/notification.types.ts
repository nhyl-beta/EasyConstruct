export interface Notification {
  id: number;
  title: string;
  message: string | null;
  type: string;
  role: string | null;
  // J3: the server has always sent these (see notifications/repository.ts
  // create()) — this type just never declared them, so nothing could
  // navigate anywhere on click.
  link: string | null;
  projectCode: string | null;
  isRead: boolean;
  createdAt: string | null;
}

export interface NotificationsQuery {
  role?: string;
  unreadOnly?: boolean;
}
