import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Shift, SwapRequest, SwapRequestStatus } from "@/types/domain";
import { SwapRequestCard } from "@/components/swaps/SwapRequestCard";
import { PaginatedListControls } from "@/components/ui/paginated-list-controls";
import {
  LoadingListSkeleton,
  LoadingState,
} from "@/components/ui/loading-state";

// ── Seen-tracking helpers ────────────────────────────────────────────────────

function seenStorageKey(userId: string) {
  return `shiftsync_swap_seen_${userId}`;
}

function loadSeenSets(userId: string): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem(seenStorageKey(userId));
    if (!raw) return {};
    const parsed: Record<string, string[]> = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, new Set(v)]),
    );
  } catch {
    return {};
  }
}

function persistSeenSets(userId: string, seen: Record<string, Set<string>>) {
  try {
    const serializable = Object.fromEntries(
      Object.entries(seen).map(([k, v]) => [k, [...v]]),
    );
    localStorage.setItem(seenStorageKey(userId), JSON.stringify(serializable));
  } catch {
    // ignore quota / security errors
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface SwapRequestListProps {
  requests: SwapRequest[];
  currentUserId: string;
  hasGoogleSyncContext?: boolean;
  userDisplayNames?: Record<string, string>;
  shiftById?: Record<string, Shift>;
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onStatusChange: (request: SwapRequest, status: SwapRequestStatus) => void;
  onApplySwap: (request: SwapRequest) => void;
}

export function SwapRequestList({
  requests,
  currentUserId,
  hasGoogleSyncContext,
  userDisplayNames,
  shiftById,
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
  onStatusChange,
  onApplySwap,
}: SwapRequestListProps) {
  const [tab, setTab] = useState("pendentes");
  const [seen, setSeen] = useState<Record<string, Set<string>>>(() =>
    loadSeenSets(currentUserId),
  );

  // Keep a stable ref to grouped so markSeen can read it without being a dep
  const groupedRef = useRef<Record<string, SwapRequest[]>>({});

  const grouped = useMemo(
    () => ({
      pendentes: requests.filter((r) => r.status === "pending"),
      enviados: requests.filter((r) => r.requesterUserId === currentUserId),
      recebidos: requests.filter((r) => r.targetUserId === currentUserId),
      aprovados: requests.filter((r) => r.status === "ready_to_apply"),
      rejeitados: requests.filter((r) => r.status === "rejected"),
      todos: requests,
    }),
    [requests, currentUserId],
  );

  groupedRef.current = grouped;

  const markTabSeen = useCallback(
    (tabKey: string, items: SwapRequest[]) => {
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
        persistSeenSets(currentUserId, updated);
        return updated;
      });
    },
    [currentUserId],
  );

  // Mark the initial tab as seen on mount
  useEffect(() => {
    markTabSeen(tab, groupedRef.current[tab] ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset seen state when user changes
  useEffect(() => {
    setSeen(loadSeenSets(currentUserId));
  }, [currentUserId]);

  const handleTabChange = useCallback(
    (newTab: string) => {
      setTab(newTab);
      markTabSeen(newTab, groupedRef.current[newTab] ?? []);
    },
    [markTabSeen],
  );

  // Count items in a group whose IDs haven't been seen yet
  const unseenCounts = useMemo(() => {
    const count = (tabKey: string, items: SwapRequest[]) => {
      const seenSet = seen[tabKey] ?? new Set<string>();
      return items.filter((r) => !seenSet.has(r.id)).length;
    };
    return {
      pendentes: count("pendentes", grouped.pendentes),
      enviados: count("enviados", grouped.enviados),
      recebidos: count("recebidos", grouped.recebidos),
      aprovados: count("aprovados", grouped.aprovados),
      rejeitados: count("rejeitados", grouped.rejeitados),
      todos: count("todos", grouped.todos),
    };
  }, [seen, grouped]);

  const renderList = (items: SwapRequest[]) => {
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
        {items.map((request) => (
          <SwapRequestCard
            key={request.id}
            request={request}
            currentUserId={currentUserId}
            hasGoogleSyncContext={hasGoogleSyncContext}
            userDisplayNames={userDisplayNames}
            shiftById={shiftById}
            onStatusChange={onStatusChange}
            onApplySwap={onApplySwap}
          />
        ))}
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
        <TabsTrigger value="pendentes">
          <TabBadge label="Pendentes" unseen={unseenCounts.pendentes} />
        </TabsTrigger>
        <TabsTrigger value="enviados">
          <TabBadge label="Enviados" unseen={unseenCounts.enviados} />
        </TabsTrigger>
        <TabsTrigger value="recebidos">
          <TabBadge label="Recebidos" unseen={unseenCounts.recebidos} />
        </TabsTrigger>
        <TabsTrigger value="aprovados">
          <TabBadge label="Aprovados" unseen={unseenCounts.aprovados} />
        </TabsTrigger>
        <TabsTrigger value="rejeitados">
          <TabBadge label="Rejeitados" unseen={unseenCounts.rejeitados} />
        </TabsTrigger>
        <TabsTrigger value="todos">
          <TabBadge label="Todos" unseen={unseenCounts.todos} />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pendentes" className="mt-3">
        {renderList(grouped.pendentes)}
      </TabsContent>
      <TabsContent value="enviados" className="mt-3">
        {renderList(grouped.enviados)}
      </TabsContent>
      <TabsContent value="recebidos" className="mt-3">
        {renderList(grouped.recebidos)}
      </TabsContent>
      <TabsContent value="aprovados" className="mt-3">
        {renderList(grouped.aprovados)}
      </TabsContent>
      <TabsContent value="rejeitados" className="mt-3">
        {renderList(grouped.rejeitados)}
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
  );
}

// ── Tab label with notification bubble ──────────────────────────────────────

function TabBadge({ label, unseen }: { label: string; unseen: number }) {
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
