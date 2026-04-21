import type { AppNotification } from "@/types/domain";

export const NOTIFICATION_ENTITY_ID_PARAM = "notificationEntityId";
export const NOTIFICATION_ENTITY_TYPE_PARAM = "notificationEntityType";
export const NOTIFICATION_ACTION_TYPE_PARAM = "notificationActionType";

export interface NotificationDestination {
  route: string;
  entityType?: string | null;
  entityId?: string | null;
  actionType?: string | null;
  metadata?: Record<string, unknown>;
}

export function resolveNotificationDestination(
  notification: AppNotification,
): NotificationDestination {
  const appendNotificationQuery = (route: string) => {
    const params = new URLSearchParams();

    if (notification.entityId) {
      params.set(NOTIFICATION_ENTITY_ID_PARAM, notification.entityId);
    }
    if (notification.entityType) {
      params.set(NOTIFICATION_ENTITY_TYPE_PARAM, notification.entityType);
    }
    if (notification.type) {
      params.set(NOTIFICATION_ACTION_TYPE_PARAM, notification.type);
    }

    const query = params.toString();
    return query ? `${route}?${query}` : route;
  };

  if (notification.link && notification.link.startsWith("/")) {
    return {
      route: appendNotificationQuery(notification.link),
      entityType: notification.entityType ?? null,
      entityId: notification.entityId ?? null,
      metadata: notification.meta,
    };
  }

  if (
    notification.type === "swap_request" ||
    notification.type === "swap_hr_decision" ||
    notification.entityType === "swap_request"
  ) {
    return {
      route: appendNotificationQuery("/home/swaps"),
      entityType: notification.entityType ?? "swap_request",
      entityId: notification.entityId ?? null,
      actionType: notification.type,
      metadata: notification.meta,
    };
  }

  if (notification.type === "leave_request") {
    return {
      route: appendNotificationQuery("/home/leave"),
      entityType: notification.entityType ?? "leave_request",
      entityId: notification.entityId ?? null,
      actionType: notification.type,
      metadata: notification.meta,
    };
  }

  if (
    notification.type === "schedule_share" ||
    notification.type === "upload_processing" ||
    notification.entityType === "sync_session"
  ) {
    return {
      route: appendNotificationQuery("/home/schedule-share"),
      entityType:
        notification.entityType ?? notification.type ?? "sync_session",
      entityId: notification.entityId ?? null,
      actionType: notification.type,
      metadata: notification.meta,
    };
  }

  return {
    route: appendNotificationQuery("/home/notifications"),
    entityType: notification.entityType ?? null,
    entityId: notification.entityId ?? null,
    actionType: notification.type,
    metadata: notification.meta,
  };
}

export function readNotificationEntityFromSearch(search: string): {
  entityId: string | null;
  entityType: string | null;
  actionType: string | null;
  metadata: null;
} {
  const params = new URLSearchParams(search);

  return {
    entityId: params.get(NOTIFICATION_ENTITY_ID_PARAM),
    entityType: params.get(NOTIFICATION_ENTITY_TYPE_PARAM),
    actionType: params.get(NOTIFICATION_ACTION_TYPE_PARAM),
    metadata: null,
  };
}
