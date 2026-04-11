import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BackendServices } from "@/services/backend/types";
import { getBackend } from "@/services/backend/backend-provider";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type {
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
} from "@/types/domain";
import { buildRankedSwapMatches } from "@/features/swaps/services/swap-matching";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";
import {
  formatSwapStatus,
  getActionLabel,
  getAllowedActionsForUser,
  getSwapStatusBadgeClass,
} from "@/features/swaps/services/swap-workflow";

interface SwapAvailabilityPanelProps {
  userId: string;
  enabled: boolean;
  backend?: Pick<BackendServices, "shifts" | "swaps">;
}

function shiftLabel(shift: Shift): string {
  const date = new Date(shift.startsAt).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
  });
  const start = new Date(shift.startsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(shift.endsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${start}-${end}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requestTitle(request: SwapRequest, currentUserId: string): string {
  if (request.requesterUserId === currentUserId) {
    return `Pedido enviado para ${request.targetUserId.slice(0, 8)}`;
  }
  return `Pedido recebido de ${request.requesterUserId.slice(0, 8)}`;
}

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 8);
}

function strategyLabel(strategy: RankedSwapMatch["strategy"]): string {
  switch (strategy) {
    case "exact":
      return "Horario igual";
    case "overlap":
      return "Horario com sobreposicao";
    case "same_day":
      return "Mesmo dia";
    default:
      return "Compatibilidade";
  }
}

function statusHelpText(status: SwapRequestStatus): string {
  switch (status) {
    case "pending":
      return "A aguardar resposta da outra pessoa.";
    case "accepted":
      return "Aceite. Pode avancar para submissao ao RH.";
    case "rejected":
      return "Rejeitado. Pode tentar outro pedido de troca.";
    case "submitted_to_hr":
      return "Enviado ao RH. Aguarda validacao final.";
    case "approved":
      return "Aprovado. Processo de troca concluido.";
    default:
      return "Estado atualizado.";
  }
}

export function SwapAvailabilityPanel({
  userId,
  enabled,
  backend,
}: SwapAvailabilityPanelProps) {
  const SWAP_POLLING_INTERVAL_MS = 10000;
  const api = backend ?? getBackend();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyMatchKey, setBusyMatchKey] = useState<string | null>(null);
  const [ownShifts, setOwnShifts] = useState<Shift[]>([]);
  const [openAvailabilities, setOpenAvailabilities] = useState<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const openOwnShiftIds = useMemo(() => {
    return new Set(
      openAvailabilities
        .filter((entry) => entry.shift.userId === userId)
        .map((entry) => entry.availability.shiftId),
    );
  }, [openAvailabilities, userId]);

  const matches = useMemo(() => {
    return buildRankedSwapMatches({
      userId,
      ownShifts,
      openAvailabilities,
    });
  }, [ownShifts, openAvailabilities, userId]);

  const activeOwnShifts = useMemo(
    () => ownShifts.filter((shift) => shift.status !== "deleted"),
    [ownShifts],
  );

  const requesterRequests = useMemo(
    () => swapRequests.filter((request) => request.requesterUserId === userId),
    [swapRequests, userId],
  );

  const targetRequests = useMemo(
    () => swapRequests.filter((request) => request.targetUserId === userId),
    [swapRequests, userId],
  );

  const pendingReceivedRequests = useMemo(
    () => targetRequests.filter((request) => request.status === "pending"),
    [targetRequests],
  );

  const pendingSentRequests = useMemo(
    () => requesterRequests.filter((request) => request.status === "pending"),
    [requesterRequests],
  );

  const loadData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [shifts, availabilities, requests] = await Promise.all([
        api.shifts.getShiftsForUser(userId),
        api.swaps.getOpenAvailabilities(),
        api.swaps.getSwapRequestsForUser(userId),
      ]);
      setOwnShifts(shifts);
      setOpenAvailabilities(availabilities);
      setSwapRequests(requests);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    void loadData();
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadData({ silent: true });
    }, SWAP_POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, userId]);

  const onToggleAvailability = async (shiftId: string) => {
    setBusyShiftId(shiftId);
    setError(null);
    try {
      if (openOwnShiftIds.has(shiftId)) {
        await api.swaps.closeAvailability(shiftId);
      } else {
        await api.swaps.openAvailability(shiftId, userId);
      }
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyShiftId(null);
    }
  };

  const onCreateSwapRequest = async (match: RankedSwapMatch) => {
    const matchKey = `${match.ownShift.id}-${match.targetShift.id}`;
    setBusyMatchKey(matchKey);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.createSwapRequest({
        requesterUserId: userId,
        requesterShiftId: match.ownShift.id,
        targetUserId: match.targetShift.userId,
        targetShiftId: match.targetShift.id,
        message: `Sugestao: ${strategyLabel(match.strategy)} (pontuacao ${match.score})`,
      });
      setFeedback("Pedido de troca criado com sucesso.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyMatchKey(null);
    }
  };

  const onUpdateSwapStatus = async (
    requestId: string,
    nextStatus: SwapRequestStatus,
  ) => {
    setBusyRequestId(requestId);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.updateSwapStatus(requestId, nextStatus, userId);
      setFeedback(`Pedido atualizado para ${formatSwapStatus(nextStatus)}.`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const renderRequestCard = (request: SwapRequest) => {
    const actions = getAllowedActionsForUser(request, userId);
    const lastHistory = request.statusHistory.at(-1);
    const primaryTimestamp =
      request.pendingAt ?? request.createdAt ?? request.updatedAt;

    return (
      <div
        key={request.id}
        className="rounded border border-slate-200 px-3 py-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">
            {requestTitle(request, userId)}
          </p>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${getSwapStatusBadgeClass(request.status)}`}
          >
            {formatSwapStatus(request.status)}
          </span>
        </div>

        <div className="space-y-1 text-xs text-slate-600">
          <p>
            Referencias dos turnos: {shortId(request.requesterShiftId)} {"->"}{" "}
            {shortId(request.targetShiftId)}
          </p>
          <p>Pedido criado em: {formatDateTime(primaryTimestamp)}</p>
          <p>{statusHelpText(request.status)}</p>
          {lastHistory && (
            <p className="text-slate-500">
              Ultima atualizacao: {formatSwapStatus(lastHistory.status)}
            </p>
          )}
        </div>

        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((status) => (
              <Button
                key={`${request.id}-${status}`}
                size="sm"
                variant={status === "rejected" ? "outline" : "default"}
                disabled={busyRequestId === request.id}
                onClick={() => {
                  void onUpdateSwapStatus(request.id, status);
                }}
              >
                {getActionLabel(status)}
              </Button>
            ))}
          </div>
        )}

        <details className="mt-3 rounded border border-slate-200 bg-slate-50 px-2 py-1">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            Ver detalhes do pedido
          </summary>
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <p>Pendente desde: {formatDateTime(request.pendingAt)}</p>
            <p>Aceite em: {formatDateTime(request.acceptedAt)}</p>
            <p>Rejeitado em: {formatDateTime(request.rejectedAt)}</p>
            <p>Submetido ao RH em: {formatDateTime(request.submittedToHrAt)}</p>
            <p>Aprovado em: {formatDateTime(request.approvedAt)}</p>
            {lastHistory && (
              <p className="text-slate-500">
                Ultima alteracao: {formatSwapStatus(lastHistory.status)} em{" "}
                {formatDateTime(lastHistory.changedAt)}
              </p>
            )}
          </div>
        </details>
      </div>
    );
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Como Funciona</h3>
        <p className="mt-1 text-xs text-slate-600">
          1) Abra disponibilidade no seu turno, 2) envie um pedido em Sugestoes
          de Match, 3) acompanhe resposta em Inbox de Pedidos.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Abrir disponibilidade nao envia pedido automaticamente. O pedido so e
          criado quando clicar em "Enviar pedido de troca".
        </p>
      </div>

      {pendingReceivedRequests.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tem {pendingReceivedRequests.length} pedido(s) de troca pendente(s)
          para rever.
        </div>
      )}

      {pendingSentRequests.length > 0 && (
        <div className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Tem {pendingSentRequests.length} pedido(s) enviado(s) a aguardar
          resposta.
        </div>
      )}

      {feedback && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {feedback}
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Erro ao carregar trocas: {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Disponibilidade para Trocas
          </h3>
          <p className="text-xs text-slate-600">
            Passo 1: abra ou feche trocas apenas para os seus turnos.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">
            A carregar disponibilidades...
          </p>
        ) : activeOwnShifts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Sem turnos disponiveis para gerir trocas.
          </p>
        ) : (
          <div className="space-y-2">
            {activeOwnShifts.slice(0, 8).map((shift) => {
              const isOpen = openOwnShiftIds.has(shift.id);
              const isBusy = busyShiftId === shift.id;
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {shiftLabel(shift)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {shift.location ?? shift.role ?? "Turno"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isOpen ? "outline" : "default"}
                    disabled={isBusy}
                    onClick={() => {
                      void onToggleAvailability(shift.id);
                    }}
                  >
                    {isOpen ? "Fechar" : "Abrir"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Sugestoes de Troca
          </h3>
          <p className="text-xs text-slate-600">
            Passo 2: escolha uma sugestao e envie o pedido de troca.
            Priorizacao: horario igual, sobreposicao de horario e mesmo dia.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">A calcular matches...</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-slate-600">Sem matches no momento.</p>
        ) : (
          <div className="space-y-2">
            {matches.slice(0, 10).map((match, index) => (
              <div
                key={`${match.ownShift.id}-${match.targetShift.id}-${index}`}
                className="rounded border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">
                  Pontuacao {match.score} - {strategyLabel(match.strategy)}
                </p>
                <p className="text-xs text-slate-600">
                  Seu turno: {shiftLabel(match.ownShift)}
                </p>
                <p className="text-xs text-slate-600">
                  Disponivel: {shiftLabel(match.targetShift)}
                </p>
                <p className="text-xs text-slate-500">
                  {match.rationale.join(" | ")}
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    disabled={
                      busyMatchKey ===
                      `${match.ownShift.id}-${match.targetShift.id}`
                    }
                    onClick={() => {
                      void onCreateSwapRequest(match);
                    }}
                  >
                    Enviar pedido de troca
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Depois de enviar, o pedido aparece na Inbox de Pedidos para ambos os
          utilizadores.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Inbox de Pedidos
          </h3>
          <p className="text-xs text-slate-600">
            Passo 3: acompanhe e responda aos pedidos. Atualiza automaticamente
            a cada 10 segundos.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">A carregar pedidos...</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pedidos enviados ({requesterRequests.length})
              </p>
              {requesterRequests.length === 0 ? (
                <p className="text-sm text-slate-600">Sem pedidos enviados.</p>
              ) : (
                requesterRequests.map(renderRequestCard)
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pedidos recebidos ({targetRequests.length})
              </p>
              {targetRequests.length === 0 ? (
                <p className="text-sm text-slate-600">Sem pedidos recebidos.</p>
              ) : (
                targetRequests.map(renderRequestCard)
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
