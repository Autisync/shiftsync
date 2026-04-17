import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationService } from "@/services/backend/types";
import type { AppNotification } from "@/types/domain";

interface NotificationBellProps {
  userId: string;
  notifications: NotificationService;
  onOpenAll: () => void;
}

export function NotificationBell({
  userId,
  notifications,
  onOpenAll,
}: NotificationBellProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;

    const runBackfill = async () => {
      try {
        await notifications.backfillSwapRequestNotifications(userId);
      } catch (error) {
        console.warn("[notifications] backfill swap requests failed", error);
      }
    };

    const load = async () => {
      const [result, unreadCount] = await Promise.all([
        notifications.listNotifications(userId, { page: 1, pageSize: 5 }),
        notifications.getUnreadCount(userId),
      ]);
      if (!mounted) return;
      setItems(result.items);
      const normalizedCount =
        Number.isFinite(unreadCount) && unreadCount >= 0
          ? Math.trunc(unreadCount)
          : result.items.filter((item) => !item.isRead).length;
      setUnread(normalizedCount);
    };

    const onNotificationCreated = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      if (customEvent.detail?.userId !== userId) {
        return;
      }
      void load();
    };

    void (async () => {
      await runBackfill();
      await load();
    })();
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
  }, [notifications, userId]);

  const markRead = async (notificationId: string) => {
    await notifications.markNotificationAsRead(notificationId);
    setItems((prev) =>
      prev.map((item) =>
        item.id === notificationId
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const markAll = async () => {
    await notifications.markAllNotificationsAsRead(userId);
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt ?? now,
      })),
    );
    setUnread(0);
  };

  const unreadCount =
    Number.isFinite(unread) && unread > 0 ? Math.trunc(unread) : 0;
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          aria-label={`Centro de notificações${
            unreadCount > 0 ? `, ${unreadLabel} por ler` : ""
          }`}
        >
          <Bell className="w-3 h-3 sm:w-4 sm:h-4" />
          {unreadCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none tabular-nums text-white sm:h-5 sm:min-w-5 sm:text-[10px]">
              {unreadLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-h-[420px]">
        <DropdownMenuLabel>Centro de notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <DropdownMenuItem disabled>Sem notificações</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => void markRead(item.id)}
              className="flex flex-col items-start gap-1"
            >
              <span className="text-xs font-semibold text-slate-800">
                {item.title}
              </span>
              <span className="line-clamp-2 text-xs text-slate-600">
                {item.body}
              </span>
              <span className="text-[11px] text-slate-400">
                {new Date(item.createdAt).toLocaleString("pt-PT")}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void markAll()}>
          Marcar todas como lidas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenAll}>
          Abrir centro completo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
