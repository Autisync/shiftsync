import { useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { appToast } from "@/lib/app-toast";
import { normalizeAppError } from "@/lib/app-error";
import { resolveNotificationDestination } from "@/features/notifications/notification-routing";
import { useNotificationFeed } from "@/features/notifications/use-notification-feed";

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, error, markRead, markAllRead } =
    useNotificationFeed({
      userId,
      service: notifications,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      activeOnly: true,
      backfill: true,
    });

  const unreadCountValue =
    Number.isFinite(unreadCount) && unreadCount > 0
      ? Math.trunc(unreadCount)
      : 0;
  const unreadLabel = unreadCountValue > 99 ? "99+" : String(unreadCountValue);

  const openNotification = async (notificationId: string) => {
    const notification = items.find((item) => item.id === notificationId);
    if (!notification) return;

    try {
      await markRead(notificationId, true);
      const destination = resolveNotificationDestination(notification);
      setOpen(false);
      navigate(destination.route);
    } catch (error) {
      const normalized = normalizeAppError(error, { context: "notification" });
      appToast.error(
        {
          title: normalized.title,
          message: normalized.message,
        },
        {
          dedupeKey: `notification-open-${notificationId}`,
        },
      );
    }
  };

  const markAll = async () => {
    try {
      await markAllRead(true);
      appToast.success(
        {
          title: "Notificações atualizadas",
          message: "Todas as notificações ativas foram marcadas como vistas.",
        },
        {
          dedupeKey: "notifications-mark-all",
        },
      );
    } catch (error) {
      const normalized = normalizeAppError(error, { context: "notification" });
      appToast.error(
        {
          title: normalized.title,
          message: normalized.message,
        },
        {
          dedupeKey: "notifications-mark-all-error",
        },
      );
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          aria-label={`Centro de notificações${
            unreadCountValue > 0 ? `, ${unreadLabel} por ler` : ""
          }`}
        >
          <Bell className="w-3 h-3 sm:w-4 sm:h-4" />
          {unreadCountValue > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none tabular-nums text-white sm:h-5 sm:min-w-5 sm:text-[10px]">
              {unreadLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-h-[420px]">
        <DropdownMenuLabel>Centro de notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {error ? (
          <DropdownMenuItem disabled>
            Não foi possível carregar as notificações agora.
          </DropdownMenuItem>
        ) : items.length === 0 ? (
          <DropdownMenuItem disabled>Sem notificações ativas</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => void openNotification(item.id)}
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
          Marcar todas como vistas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenAll}>
          Abrir centro completo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
