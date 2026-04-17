import { useEffect, useState } from "react";
import type { NotificationService } from "@/services/backend/types";
import type { AppNotification } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { PaginatedListControls } from "@/components/ui/paginated-list-controls";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface NotificationsPageProps {
  userId: string;
  service: NotificationService;
}

export function NotificationsPage({ userId, service }: NotificationsPageProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.listNotifications(userId, {
          page,
          pageSize,
        });
        if (!mounted) return;
        setItems(result.items);
        setTotal(result.total);
      } catch (err) {
        if (!mounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [page, pageSize, service, userId]);

  const markRead = async (id: string) => {
    await service.markNotificationAsRead(id);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, isRead: true, readAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const markAll = async () => {
    await service.markAllNotificationsAsRead(userId);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
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

      {loading ? <p className="text-sm text-slate-500">A carregar...</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-slate-500">Sem notificações.</p>
      ) : null}

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void markRead(item.id)}
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
