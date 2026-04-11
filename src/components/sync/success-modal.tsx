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
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full sm:w-16 sm:h-16">
              <CheckCircle2 className="w-8 h-8 text-green-600 sm:w-10 sm:h-10" />
            </div>
          </div>
          <DialogTitle className="text-xl text-center sm:text-2xl">
            Sincronizado com Sucesso!
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm text-center sm:text-base">
            Os seus turnos foram sincronizados com o seu calendário
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4 sm:py-4">
          {/* Calendar Info */}
          {calendarName && (
            <div className="p-3 border rounded-lg bg-slate-50 sm:p-4 border-slate-200">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg sm:w-10 sm:h-10">
                  <Calendar className="w-4 h-4 text-blue-600 sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Sincronizado com
                  </p>
                  <p className="text-xs font-semibold truncate sm:text-sm">
                    {calendarName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="p-2 text-center border border-green-200 rounded-lg sm:p-3 bg-green-50">
              <p className="text-xl font-bold text-green-900 sm:text-2xl">
                {summary.create}
              </p>
              <p className="text-xs text-green-700">Criados</p>
            </div>
            <div className="p-2 text-center border border-blue-200 rounded-lg sm:p-3 bg-blue-50">
              <p className="text-xl font-bold text-blue-900 sm:text-2xl">
                {summary.update}
              </p>
              <p className="text-xs text-blue-700">Atualizados</p>
            </div>
            <div className="p-2 text-center border border-red-200 rounded-lg sm:p-3 bg-red-50">
              <p className="text-xl font-bold text-red-900 sm:text-2xl">
                {summary.delete}
              </p>
              <p className="text-xs text-red-700">Eliminados</p>
            </div>
          </div>

{/* Resultado da Sincronização */}
          {/* <div className="p-3 space-y-2 bg-white border rounded-lg border-slate-200 sm:p-4">
            <p className="text-xs font-semibold sm:text-sm text-slate-900">
              Resultado da Sincronização
            </p>

            <details className="px-3 py-2 border border-green-200 rounded bg-green-50">
              <summary className="text-sm font-medium text-green-900 cursor-pointer">
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

            <details className="px-3 py-2 border border-blue-200 rounded bg-blue-50">
              <summary className="text-sm font-medium text-blue-900 cursor-pointer">
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

            <details className="px-3 py-2 border border-red-200 rounded bg-red-50">
              <summary className="text-sm font-medium text-red-900 cursor-pointer">
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
          </div> */}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <Button
              onClick={onNewSync}
              className="w-full h-10 text-sm font-semibold sm:h-12 sm:text-base"
            >
              <ArrowRight className="w-3 h-3 mr-2 sm:w-4 sm:h-4" />
              Sincronizar Outro Ficheiro
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-10 text-sm sm:h-auto sm:text-base"
            >
              Voltar ao Painel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
