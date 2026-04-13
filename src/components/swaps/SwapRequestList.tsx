import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Shift, SwapRequest, SwapRequestStatus } from "@/types/domain";
import { SwapRequestCard } from "@/components/swaps/SwapRequestCard";

interface SwapRequestListProps {
  requests: SwapRequest[];
  currentUserId: string;
  hasGoogleSyncContext?: boolean;
  userDisplayNames?: Record<string, string>;
  shiftById?: Record<string, Shift>;
  onStatusChange: (request: SwapRequest, status: SwapRequestStatus) => void;
  onSendToHr: (request: SwapRequest) => void;
  onApplySwap: (request: SwapRequest) => void;
}

export function SwapRequestList({
  requests,
  currentUserId,
  hasGoogleSyncContext,
  userDisplayNames,
  shiftById,
  onStatusChange,
  onSendToHr,
  onApplySwap,
}: SwapRequestListProps) {
  const [tab, setTab] = useState("pendentes");

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

  const renderList = (items: SwapRequest[]) => {
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
            onSendToHr={onSendToHr}
            onApplySwap={onApplySwap}
          />
        ))}
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
        <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
        <TabsTrigger value="enviados">Enviados</TabsTrigger>
        <TabsTrigger value="recebidos">Recebidos</TabsTrigger>
        <TabsTrigger value="aprovados">Aprovados</TabsTrigger>
        <TabsTrigger value="rejeitados">Rejeitados</TabsTrigger>
        <TabsTrigger value="todos">Todos</TabsTrigger>
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
    </Tabs>
  );
}
