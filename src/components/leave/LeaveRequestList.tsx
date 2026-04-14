/**
 * src/components/leave/LeaveRequestList.tsx
 *
 * Tabbed view of leave requests with unseen-notification bubbles.
 * Tabs: Pendentes | Aprovados | Rejeitados | Expirados | Todos
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaveRequest } from "@/types/domain";
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
  userId: string;
  canReview?: boolean;
  onApprove?: (request: LeaveRequest, input: LeaveApproveInput) => void;
  onReject?: (request: LeaveRequest, input: LeaveRejectInput) => void;
  onCalendarSync?: (request: LeaveRequest) => void;
  onUpdateApprovedDates?: (
    request: LeaveRequest,
    start: string,
    end: string,
  ) => void;
  busyId?: string | null;
  syncingId?: string | null;
}

export function LeaveRequestList({
  requests,
  userId,
  canReview = false,
  onApprove,
  onReject,
  onCalendarSync,
  onUpdateApprovedDates,
  busyId,
  syncingId,
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

  const renderList = (items: LeaveRequest[]) => {
    if (items.length === 0) {
      return <p className="text-sm text-slate-500">Sem pedidos nesta vista.</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((req) => (
          <LeaveRequestCard
            key={req.id}
            request={req}
            canReview={canReview}
            onApprove={onApprove}
            onReject={onReject}
            onCalendarSync={onCalendarSync}
            onUpdateApprovedDates={onUpdateApprovedDates}
            busy={busyId === req.id}
            calendarSyncing={syncingId === req.id}
          />
        ))}
      </div>
    );
  };

  return (
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
    </Tabs>
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
