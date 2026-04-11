import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar, ArrowRight } from "lucide-react";
import { SyncSummary } from "@/types/shift";
import type { CalendarSyncPreviewChange } from "@/features/calendar/types";

interface SuccessModalProps {
  open: boolean;
  onClose: () => void;
  onNewSync: () => void;
  summary: SyncSummary;
  changes: CalendarSyncPreviewChange[];
  calendarName?: string;
}

function formatShiftLine(item: CalendarSyncPreviewChange): string {
  const source = item.start ?? item.date;
  if (!source) {
    return item.title ?? "Turno";
  }

  const date = new Date(source);
  const day = date.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });

  if (!item.start || !item.end) {
    return `${day} ${item.title ?? "Turno"}`;
  }

  const start = new Date(item.start).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(item.end).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day} ${start}-${end}`;
}

export function SuccessModal({
  open,
  onClose,
  onNewSync,
  summary,
  changes,
  calendarName,
}: SuccessModalProps) {
  const createdChanges = changes.filter((item) => item.type === "create");
  const updatedChanges = changes.filter((item) => item.type === "update");
  const deletedChanges = changes.filter((item) => item.type === "delete");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl sm:text-2xl">
            Sincronizado com Sucesso!
          </DialogTitle>
          <DialogDescription className="text-center text-sm sm:text-base pt-2">
            Os seus turnos foram sincronizados com o seu calendário
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 sm:py-4">
          {/* Calendar Info */}
          {calendarName && (
            <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    Sincronizado com
                  </p>
                  <p className="font-semibold text-xs sm:text-sm truncate">
                    {calendarName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="text-center p-2 sm:p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xl sm:text-2xl font-bold text-green-900">
                {summary.create}
              </p>
              <p className="text-xs text-green-700">Criados</p>
            </div>
            <div className="text-center p-2 sm:p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xl sm:text-2xl font-bold text-blue-900">
                {summary.update}
              </p>
              <p className="text-xs text-blue-700">Atualizados</p>
            </div>
            <div className="text-center p-2 sm:p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xl sm:text-2xl font-bold text-red-900">
                {summary.delete}
              </p>
              <p className="text-xs text-red-700">Eliminados</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 space-y-2">
            <p className="text-xs sm:text-sm font-semibold text-slate-900">
              Resultado da Sincronização
            </p>

            <details className="rounded border border-green-200 bg-green-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-green-900">
                ✅ Criados: {summary.create} evento
                {summary.create === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-1 text-xs text-green-800">
                {createdChanges.length === 0 ? (
                  <p>Sem novos turnos criados.</p>
                ) : (
                  createdChanges.map((item, index) => (
                    <p
                      key={`created-${item.syncShiftKey ?? "unknown"}-${index}`}
                    >
                      - {formatShiftLine(item)}
                    </p>
                  ))
                )}
              </div>
            </details>

            <details className="rounded border border-blue-200 bg-blue-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-blue-900">
                🔄 Atualizados: {summary.update} evento
                {summary.update === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-1 text-xs text-blue-800">
                {updatedChanges.length === 0 ? (
                  <p>Sem turnos atualizados.</p>
                ) : (
                  updatedChanges.map((item, index) => (
                    <p
                      key={`updated-${item.syncShiftKey ?? "unknown"}-${index}`}
                    >
                      - {formatShiftLine(item)}
                    </p>
                  ))
                )}
              </div>
            </details>

            <details className="rounded border border-red-200 bg-red-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-red-900">
                ❌ Eliminados: {summary.delete} evento
                {summary.delete === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-1 text-xs text-red-800">
                {deletedChanges.length === 0 ? (
                  <p>Sem turnos eliminados.</p>
                ) : (
                  deletedChanges.map((item, index) => (
                    <p
                      key={`deleted-${item.syncShiftKey ?? "unknown"}-${index}`}
                    >
                      - {formatShiftLine(item)}
                    </p>
                  ))
                )}
              </div>
            </details>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={onNewSync}
              className="w-full h-10 sm:h-12 font-semibold text-sm sm:text-base"
            >
              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              Sincronizar Outro Ficheiro
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-10 sm:h-auto text-sm sm:text-base"
            >
              Voltar ao Painel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
