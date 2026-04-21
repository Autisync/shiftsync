import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationService } from "@/services/backend/types";
import { Button } from "@/components/ui/button";
import { PaginatedListControls } from "@/components/ui/paginated-list-controls";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  LoadingListSkeleton,
  LoadingState,
} from "@/components/ui/loading-state";
import { appToast } from "@/lib/app-toast";
import { normalizeAppError } from "@/lib/app-error";
import { resolveNotificationDestination } from "@/features/notifications/notification-routing";
import { useNotificationFeed } from "@/features/notifications/use-notification-feed";

interface NotificationsPageProps {
  userId: string;
  service: NotificationService;
}

export function NotificationsPage({ userId, service }: NotificationsPageProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const { items, total, loading, error, markRead, markAllRead } =
    useNotificationFeed({
      userId,
      service,
      page,
      pageSize,
      backfill: true,
    });

  const openNotification = async (id: string) => {
    const notification = items.find((item) => item.id === id);
    if (!notification) return;

    try {
      await markRead(id);
      navigate(resolveNotificationDestination(notification).route);
    } catch (markError) {
      const normalized = normalizeAppError(markError, {
        context: "notification",
      });
      appToast.error(
        {
          title: normalized.title,
          message: normalized.message,
        },
        {
          dedupeKey: `notification-page-open-${id}`,
        },
      );
    }
  };

  const markAll = async () => {
    try {
      await markAllRead();
      appToast.success(
        {
          title: "Notificações atualizadas",
          message: "Todas as notificações foram marcadas como lidas.",
        },
        {
          dedupeKey: "notifications-page-mark-all",
        },
      );
    } catch (markAllError) {
      const normalized = normalizeAppError(markAllError, {
        context: "notification",
      });
      appToast.error(
        {
          title: normalized.title,
          message: normalized.message,
        },
        {
          dedupeKey: "notifications-page-mark-all-error",
        },
      );
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
            Notificações
          </h2>
          <p className="text-xs text-slate-500">
            Trocas, decisões RH, ausências, uploads, partilhas e lembretes.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void markAll()}>
          Marcar todas como lidas
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <LoadingState inline message="A carregar notificações..." />
          <LoadingListSkeleton rows={3} />
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Não existem notificações para mostrar.
        </p>
      ) : null}

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void openNotification(item.id)}
            className={`w-full rounded-md border px-3 py-2 text-left ${
              item.isRead
                ? "border-slate-200 bg-white"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <p className="text-xs font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-600">{item.body}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {new Date(item.createdAt).toLocaleString("pt-PT")}
            </p>
          </button>
        ))}
      </div>

      <PaginatedListControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}
