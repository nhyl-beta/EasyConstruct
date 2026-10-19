import { apiClient } from "@/services/api.client";
import type { Notification, NotificationsQuery } from "../types/notification.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const NotificationRepository = {
  async list(query: NotificationsQuery = {}): Promise<Notification[]> {
    const params = new URLSearchParams();
    if (query.role) params.set("role", query.role);
    if (query.unreadOnly) params.set("unreadOnly", "true");
    const qs = params.toString();
    return unwrap<Notification[]>(
      apiClient.get(`/notifications${qs ? `?${qs}` : ""}`),
    );
  },

  async markRead(id: number): Promise<Notification> {
    return unwrap<Notification>(apiClient.patch(`/notifications/${id}/read`, {}));
  },
};
