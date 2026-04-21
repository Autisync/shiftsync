/**
 * src/components/leave/LeaveRequestList.tsx
 *
 * Tabbed view of leave requests with unseen-notification bubbles.
 * Tabs: Pendentes | Aprovados | Rejeitados | Expirados | Todos
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaveRequest } from "@/types/domain";
import { PaginatedListControls } from "@/components/ui/paginated-list-controls";
import {
  LoadingListSkeleton,
  LoadingState,
} from "@/components/ui/loading-state";
import {
  LeaveRequestCard,
  type LeaveApproveInput,
  type LeaveRejectInput,
} from "@/components/leave/LeaveRequestCard";

// ── Seen-tracking (same localStorage pattern as SwapRequestList) ─────────

function seenKey(userId: string) {
  return `shiftsync_leave_seen_${userId}`;
}

function loadSeen(userId: string): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    if (!raw) return {};
    const parsed: Record<string, string[]> = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, new Set(v)]),
    );
  } catch {
    return {};
  }
}

function persistSeen(userId: string, seen: Record<string, Set<string>>) {
  try {
    localStorage.setItem(
      seenKey(userId),
      JSON.stringify(
        Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]])),
      ),
    );
  } catch {
    // ignore quota errors
  }
}

// ── Component ─────────────────────────────────────────────────────────────

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  focusedRequest?: LeaveRequest | null;
  userId: string;
  canReview?: boolean;
  onApprove?: (request: LeaveRequest, input: LeaveApproveInput) => void;
  onReject?: (request: LeaveRequest, input: LeaveRejectInput) => void;
  onDelete?: (request: LeaveRequest) => void;
  onCalendarSync?: (request: LeaveRequest) => void;
  onUpdateApprovedDates?: (
    request: LeaveRequest,
    start: string,
    end: string,
  ) => void;
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  busyId?: string | null;
  syncingId?: string | null;
  focusedRequestId?: string | null;
}

export function LeaveRequestList({
  requests,
  focusedRequest = null,
  userId,
  canReview = false,
  onApprove,
  onReject,
  onDelete,
  onCalendarSync,
  onUpdateApprovedDates,
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
  busyId,
  syncingId,
  focusedRequestId = null,
}: LeaveRequestListProps) {
  const [tab, setTab] = useState("pendentes");
  const [seen, setSeen] = useState<Record<string, Set<string>>>(() =>
    loadSeen(userId),
  );

  const grouped = useMemo(
    () => ({
      pendentes: requests.filter(
        (r) => r.status === "draft" || r.status === "pending",
      ),
      aprovados: requests.filter((r) => r.status === "approved"),
      rejeitados: requests.filter((r) => r.status === "rejected"),
      expirados: requests.filter((r) => r.status === "soft_declined"),
      todos: requests,
    }),
    [requests],
  );

  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;

  // Track the last focusedRequestId we already scrolled to so data-refresh
  // polling doesn't re-scroll the user away from wherever they navigated.
  const scrolledToRef = useRef<string | null>(null);

  const markTabSeen = useCallback(
    (tabKey: string, items: LeaveRequest[]) => {
      if (items.length === 0) return;
      setSeen((prev) => {
        const existing = prev[tabKey] ?? new Set<string>();
        const next = new Set(existing);
        let changed = false;
        for (const r of items) {
          if (!next.has(r.id)) {
            next.add(r.id);
            changed = true;
          }
        }
        if (!changed) return prev;
        const updated = { ...prev, [tabKey]: next };
        persistSeen(userId, updated);
        return updated;
      });
    },
    [userId],
  );

  useEffect(() => {
    markTabSeen(
      tab,
      groupedRef.current[tab as keyof typeof groupedRef.current] ?? [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSeen(loadSeen(userId));
  }, [userId]);

  const handleTabChange = useCallback(
    (newTab: string) => {
      setTab(newTab);
      markTabSeen(
        newTab,
        groupedRef.current[newTab as keyof typeof groupedRef.current] ?? [],
      );
    },
    [markTabSeen],
  );

  const unseenCounts = useMemo(() => {
    const count = (tabKey: string, items: LeaveRequest[]) => {
      const seenSet = seen[tabKey] ?? new Set<string>();
      return items.filter((r) => !seenSet.has(r.id)).length;
    };
    return {
      pendentes: count("pendentes", grouped.pendentes),
      aprovados: count("aprovados", grouped.aprovados),
      rejeitados: count("rejeitados", grouped.rejeitados),
      expirados: count("expirados", grouped.expirados),
      todos: count("todos", grouped.todos),
    };
  }, [seen, grouped]);

  useEffect(() => {
    if (!focusedRequestId) {
      scrolledToRef.current = null;
      return;
    }

    // Reset guard when the focused id changes.
    if (scrolledToRef.current !== focusedRequestId) {
      scrolledToRef.current = null;
    }

    // Already scrolled to this id — don't re-scroll on data refreshes.
    if (scrolledToRef.current === focusedRequestId) {
      return;
    }

    const nextTab = Object.entries(grouped).find(([, items]) =>
      items.some((request) => request.id === focusedRequestId),
    )?.[0];

    if (nextTab && nextTab !== tab) {
      handleTabChange(nextTab);
      return;
    }

    scrolledToRef.current = focusedRequestId;
    const frameId = window.requestAnimationFrame(() => {
      const element = document.getElementById(
        `leave-request-card-${focusedRequestId}`,
      );
      const spotlight = document.getElementById(
        `leave-request-spotlight-${focusedRequestId}`,
      );
      (element ?? spotlight)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusedRequestId, grouped, handleTabChange, tab]);

  const renderList = (items: LeaveRequest[]) => {
    if (loading && items.length === 0) {
      return (
        <div className="space-y-3">
          <LoadingState message="A carregar pedidos..." inline />
          <LoadingListSkeleton rows={3} />
        </div>
      );
    }

    if (items.length === 0) {
      return <p className="text-sm text-slate-500">Sem pedidos nesta vista.</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((req) => (
          <div key={req.id} id={`leave-request-card-${req.id}`}>
            <LeaveRequestCard
              request={req}
              canReview={canReview}
              onApprove={onApprove}
              onReject={onReject}
              onDelete={onDelete}
              onCalendarSync={onCalendarSync}
              onUpdateApprovedDates={onUpdateApprovedDates}
              busy={busyId === req.id}
              calendarSyncing={syncingId === req.id}
              isHighlighted={focusedRequestId === req.id}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {focusedRequest &&
      !grouped.todos.some((request) => request.id === focusedRequest.id) ? (
        <div
          id={`leave-request-spotlight-${focusedRequest.id}`}
          className="rounded-xl border border-blue-200 bg-blue-50/60 p-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Pedido aberto via notificação
          </p>
          <LeaveRequestCard
            request={focusedRequest}
            canReview={canReview}
            onApprove={onApprove}
            onReject={onReject}
            onDelete={onDelete}
            onCalendarSync={onCalendarSync}
            onUpdateApprovedDates={onUpdateApprovedDates}
            busy={busyId === focusedRequest.id}
            calendarSyncing={syncingId === focusedRequest.id}
            isHighlighted
          />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pendentes">
            <LeaveBadge label="Pendentes" unseen={unseenCounts.pendentes} />
          </TabsTrigger>
          <TabsTrigger value="aprovados">
            <LeaveBadge label="Aprovados" unseen={unseenCounts.aprovados} />
          </TabsTrigger>
          <TabsTrigger value="rejeitados">
            <LeaveBadge label="Rejeitados" unseen={unseenCounts.rejeitados} />
          </TabsTrigger>
          <TabsTrigger value="expirados">
            <LeaveBadge label="Expirados" unseen={unseenCounts.expirados} />
          </TabsTrigger>
          <TabsTrigger value="todos">
            <LeaveBadge label="Todos" unseen={unseenCounts.todos} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-3">
          {renderList(grouped.pendentes)}
        </TabsContent>
        <TabsContent value="aprovados" className="mt-3">
          {renderList(grouped.aprovados)}
        </TabsContent>
        <TabsContent value="rejeitados" className="mt-3">
          {renderList(grouped.rejeitados)}
        </TabsContent>
        <TabsContent value="expirados" className="mt-3">
          {renderList(grouped.expirados)}
        </TabsContent>
        <TabsContent value="todos" className="mt-3">
          {renderList(grouped.todos)}
        </TabsContent>

        <PaginatedListControls
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={onPageChange}
        />
      </Tabs>
    </div>
  );
}

function LeaveBadge({ label, unseen }: { label: string; unseen: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {unseen > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
          {unseen > 99 ? "99+" : unseen}
        </span>
      )}
    </span>
  );
}
