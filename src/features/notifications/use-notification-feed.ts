import { useCallback, useEffect, useMemo, useState } from "react";
import type { NotificationService } from "@/services/backend/types";
import type { AppNotification } from "@/types/domain";
import { normalizeAppError } from "@/lib/app-error";

interface UseNotificationFeedOptions {
  userId: string;
  service: NotificationService;
  page: number;
  pageSize: number;
  activeOnly?: boolean;
  backfill?: boolean;
}

export function useNotificationFeed({
  userId,
  service,
  page,
  pageSize,
  activeOnly = false,
  backfill = false,
}: UseNotificationFeedOptions) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryPageSize = activeOnly ? Math.max(pageSize * 4, 20) : pageSize;
      const [result, unread] = await Promise.all([
        service.listNotifications(userId, { page, pageSize: queryPageSize }),
        service.getUnreadCount(userId),
      ]);

      const deduped = result.items.filter((item, index, source) => {
        return (
          source.findIndex((candidate) => candidate.id === item.id) === index
        );
      });
      const filtered = activeOnly
        ? deduped.filter((item) => !item.isRead)
        : deduped;

      setItems(activeOnly ? filtered.slice(0, pageSize) : filtered);
      setTotal(activeOnly ? unread : result.total);
      setUnreadCount(
        Number.isFinite(unread) && unread >= 0
          ? Math.trunc(unread)
          : deduped.filter((item) => !item.isRead).length,
      );
    } catch (loadError) {
      const normalized = normalizeAppError(loadError, {
        context: "notification",
      });
      setError(normalized.message);
    } finally {
      setLoading(false);
    }
  }, [activeOnly, page, pageSize, service, userId]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (backfill) {
        try {
          await service.backfillSwapRequestNotifications(userId);
        } catch {
          // Keep bell resilient even if backfill fails.
        }
      }

      if (!mounted) return;
      await load();
    };

    const onNotificationCreated = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      if (customEvent.detail?.userId !== userId) {
        return;
      }
      void load();
    };

    void run();
    const timer = window.setInterval(() => void load(), 15000);
    window.addEventListener(
      "in-app-notification-created",
      onNotificationCreated,
    );

    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener(
        "in-app-notification-created",
        onNotificationCreated,
      );
    };
  }, [backfill, load, service, userId]);

  const markRead = useCallback(
    async (notificationId: string, removeAfterRead = false) => {
      await service.markNotificationAsRead(notificationId);
      setItems((prev) => {
        const next = prev
          .map((item) =>
            item.id === notificationId
              ? { ...item, isRead: true, readAt: new Date().toISOString() }
              : item,
          )
          .filter((item) =>
            removeAfterRead ? item.id !== notificationId : true,
          );
        return next;
      });
      setUnreadCount((prev) => Math.max(0, prev - 1));
    },
    [service],
  );

  const markAllRead = useCallback(
    async (removeAfterRead = false) => {
      await service.markAllNotificationsAsRead(userId);
      const now = new Date().toISOString();
      setItems((prev) =>
        removeAfterRead
          ? []
          : prev.map((item) => ({
              ...item,
              isRead: true,
              readAt: item.readAt ?? now,
            })),
      );
      setUnreadCount(0);
      if (removeAfterRead) {
        setTotal(0);
      }
    },
    [service, userId],
  );

  return useMemo(
    () => ({
      items,
      total,
      unreadCount,
      loading,
      error,
      load,
      markRead,
      markAllRead,
    }),
    [error, items, load, loading, markAllRead, markRead, total, unreadCount],
  );
}
