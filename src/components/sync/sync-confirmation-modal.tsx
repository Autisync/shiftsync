import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncSummary, GoogleCalendar } from "@/types/shift";
import { GoogleCalendarService } from "@/lib/google-calendar";
import { CreateCalendarDialog } from "@/components/calendar/create-calendar-dialog";
import {
  PlusCircle,
  Edit3,
  Trash2,
  AlertTriangle,
  Info,
  Calendar,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "sonner";
import type { CalendarSyncPreviewChange } from "@/features/calendar/types";
import type { ConstraintViolation } from "@/features/swaps/services/swap-constraints";
import { LoadingState } from "@/components/ui/loading-state";
import { Spinner } from "@/components/ui/spinner";
import { runWithToast } from "@/lib/async-toast";

const STORAGE_KEY_SELECTED_CALENDAR = "selected_calendar_id";

interface SyncConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: {
    calendarId: string;
    calendarSummary?: string;
    options: {
      dateRange?: { start: string; end: string };
      fullResync: boolean;
      removeStaleEvents: boolean;
    };
  }) => void;
  summary: SyncSummary & { noop?: number; failed?: number };
  changes: CalendarSyncPreviewChange[];
  constraintWarnings?: ConstraintViolation[];
  onRequestPreview: (input: {
    calendarId: string;
    options: {
      dateRange?: { start: string; end: string };
      fullResync: boolean;
      removeStaleEvents: boolean;
    };
  }) => Promise<void>;
  previewLoading?: boolean;
  loading?: boolean;
  accessToken: string;
  initialCalendarId?: string | null;
  onTokenExpired?: () => void;
}

export function SyncConfirmationModal({
  open,
  onClose,
  onConfirm,
  summary,
  changes,
  constraintWarnings = [],
  onRequestPreview,
  previewLoading,
  loading,
  accessToken,
  initialCalendarId,
  onTokenExpired,
}: SyncConfirmationModalProps) {
  const totalChanges = summary.create + summary.update + summary.delete;

  // Calendar state
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
    initialCalendarId || null,
  );
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creatingCalendar, setCreatingCalendar] = useState(false);
  const [fullResync, setFullResync] = useState(false);
  const [removeStaleEvents, setRemoveStaleEvents] = useState(true);
  const [rangePreset, setRangePreset] = useState<
    "auto" | "this-week" | "next-week" | "this-month"
  >("auto");

  // Fetch calendars when modal opens
  useEffect(() => {
    if (open && accessToken) {
      fetchCalendars();
    }
  }, [open, accessToken]);

  // Update selected calendar when initialCalendarId changes
  useEffect(() => {
    if (initialCalendarId) {
      setSelectedCalendarId(initialCalendarId);
    }
  }, [initialCalendarId]);

  // Restore from localStorage if no initial calendar
  useEffect(() => {
    if (open && !initialCalendarId && calendars.length > 0) {
      const storedId = localStorage.getItem(STORAGE_KEY_SELECTED_CALENDAR);
      if (storedId && calendars.some((c) => c.id === storedId)) {
        setSelectedCalendarId(storedId);
      }
    }
  }, [open, initialCalendarId, calendars]);

  const fetchCalendars = async () => {
    if (!accessToken) return;

    try {
      setCalendarsLoading(true);
      setCalendarsError(null);
      const service = new GoogleCalendarService(accessToken);
      const calendarList = await service.listCalendars();
      setCalendars(calendarList);

      // If no calendar selected but we have a stored preference
      if (!selectedCalendarId) {
        const storedId = localStorage.getItem(STORAGE_KEY_SELECTED_CALENDAR);
        if (storedId && calendarList.some((c) => c.id === storedId)) {
          setSelectedCalendarId(storedId);
        } else {
          // Auto-select primary
          const primary = calendarList.find((cal) => cal.primary);
          if (primary) {
            setSelectedCalendarId(primary.id);
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);

      if (
        errorMessage.includes("401") ||
        errorMessage.toLowerCase().includes("unauthorized") ||
        errorMessage.toLowerCase().includes("invalid credentials")
      ) {
        onTokenExpired?.();
        return;
      }

      setCalendarsError(errorMessage);
    } finally {
      setCalendarsLoading(false);
    }
  };

  const handleSelectCalendar = (id: string) => {
    setSelectedCalendarId(id);
    localStorage.setItem(STORAGE_KEY_SELECTED_CALENDAR, id);
  };

  const handleCreateCalendar = async (
    name: string,
    timeZone: string,
    description?: string,
  ) => {
    if (!accessToken) return;

    try {
      setCreatingCalendar(true);
      const service = new GoogleCalendarService(accessToken);
      const newCalendar = await runWithToast(
        () => service.createCalendar(name, timeZone, description),
        {
          loading: "A criar calendário...",
          success: (calendar) =>
            `Calendário "${calendar.summary}" criado com sucesso!`,
          error: (error) =>
            "Falha ao criar calendário: " + getErrorMessage(error),
        },
      );

      // Refresh calendars and select the new one
      await fetchCalendars();
      setSelectedCalendarId(newCalendar.id);
      localStorage.setItem(STORAGE_KEY_SELECTED_CALENDAR, newCalendar.id);
      setShowCreateDialog(false);
    } catch {
    } finally {
      setCreatingCalendar(false);
    }
  };

  const handleConfirm = () => {
    if (selectedCalendarId) {
      onConfirm({
        calendarId: selectedCalendarId,
        calendarSummary: selectedCalendar?.summary,
        options: {
          dateRange: resolveDateRange(rangePreset),
          fullResync,
          removeStaleEvents,
        },
      });
    }
  };

  const resolveDateRange = (
    preset: "auto" | "this-week" | "next-week" | "this-month",
  ): { start: string; end: string } | undefined => {
    if (preset === "auto") {
      return undefined;
    }

    const today = new Date();
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const end = new Date(start);

    if (preset === "this-week") {
      const day = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - day);
      end.setUTCDate(start.getUTCDate() + 6);
    }

    if (preset === "next-week") {
      const day = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - day + 7);
      end.setUTCDate(start.getUTCDate() + 6);
    }

    if (preset === "this-month") {
      start.setUTCDate(1);
      end.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth() + 1, 0);
    }

    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  };

  const handleRefreshPreview = async () => {
    if (!selectedCalendarId) {
      return;
    }

    await onRequestPreview({
      calendarId: selectedCalendarId,
      options: {
        dateRange: resolveDateRange(rangePreset),
        fullResync,
        removeStaleEvents,
      },
    });
  };

  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);
  const canSync = selectedCalendarId && !calendarsLoading && !loading;
  const visibleChanges = changes
    .filter((item) => item.type !== "noop")
    .slice(0, 12);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-bold">
              Confirmar Sincronização
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Reveja as alterações e selecione o calendário para sincronizar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 sm:py-4">
            {/* Calendar Selection Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                  Calendário de Destino
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchCalendars}
                  disabled={calendarsLoading}
                  className="h-7 sm:h-8 px-2"
                >
                  <RefreshCw
                    className={`w-3 h-3 sm:w-4 sm:h-4 ${calendarsLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {calendarsError && (
                <Alert variant="destructive">
                  <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm">
                    <span>{calendarsError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchCalendars}
                      className="w-full sm:w-auto"
                    >
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {calendarsLoading && !calendarsError ? (
                <LoadingState inline message="A carregar calendários..." />
              ) : null}

              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={selectedCalendarId || undefined}
                  onValueChange={handleSelectCalendar}
                  disabled={calendarsLoading || calendars.length === 0}
                >
                  <SelectTrigger className="flex-1 h-10 sm:h-11 text-xs sm:text-sm">
                    <SelectValue
                      placeholder={
                        calendarsLoading
                          ? "A carregar calendários..."
                          : "Selecione um calendário"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        <div className="flex items-center gap-2">
                          {calendar.backgroundColor && (
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0 calendar-color-swatch"
                              {...({
                                style: {
                                  "--swatch-color": calendar.backgroundColor,
                                },
                              } as React.HTMLAttributes<HTMLDivElement>)}
                            />
                          )}
                          <span className="truncate text-xs sm:text-sm">
                            {calendar.summary}
                          </span>
                          {calendar.primary && (
                            <span className="text-xs text-muted-foreground">
                              (Principal)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(true)}
                  disabled={calendarsLoading}
                  className="h-10 sm:h-11 px-3 w-full sm:w-auto"
                  title="Criar novo calendário"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="sm:hidden ml-2">Criar Calendário</span>
                </Button>
              </div>

              {/* Selected calendar preview */}
              {selectedCalendar && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {selectedCalendar.backgroundColor && (
                      <div
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg shadow-sm flex-shrink-0 calendar-color-swatch"
                        {...({
                          style: {
                            "--swatch-color": selectedCalendar.backgroundColor,
                          },
                        } as React.HTMLAttributes<HTMLDivElement>)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs sm:text-sm truncate">
                        {selectedCalendar.summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCalendar.primary
                          ? "Calendário Principal"
                          : "Calendário Secundário"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!selectedCalendarId &&
                !calendarsLoading &&
                calendars.length > 0 && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-xs sm:text-sm text-amber-900">
                      Por favor, selecione um calendário para continuar
                    </AlertDescription>
                  </Alert>
                )}
            </div>

            {/* Sync Controls */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-700">
                    Janela de Sincronização
                  </label>
                  <Select
                    value={rangePreset}
                    onValueChange={(value) =>
                      setRangePreset(
                        value as
                          | "auto"
                          | "this-week"
                          | "next-week"
                          | "this-month",
                      )
                    }
                  >
                    <SelectTrigger className="h-9 text-xs mt-1">
                      <SelectValue placeholder="Escolher janela" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Auto (período importado)
                      </SelectItem>
                      <SelectItem value="this-week">Esta semana</SelectItem>
                      <SelectItem value="next-week">Próxima semana</SelectItem>
                      <SelectItem value="this-month">Este mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-xs"
                    disabled={!selectedCalendarId || previewLoading}
                    onClick={handleRefreshPreview}
                  >
                    {previewLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner className="size-4" />A calcular...
                      </span>
                    ) : (
                      "Atualizar Pré-visualização"
                    )}
                  </Button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={fullResync}
                  onChange={(event) => setFullResync(event.target.checked)}
                />
                Full resync (recalcular tudo dentro da janela)
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={removeStaleEvents}
                  onChange={(event) =>
                    setRemoveStaleEvents(event.target.checked)
                  }
                />
                Remover eventos ShiftSync antigos que já não existem neste
                horário
              </label>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-green-50 rounded-lg p-3 sm:p-4 border border-green-200">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-center text-green-900">
                  {summary.create}
                </p>
                <p className="text-xs text-center text-green-700 font-medium mt-1">
                  Criar
                </p>
              </div>

              <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-200">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-center text-blue-900">
                  {summary.update}
                </p>
                <p className="text-xs text-center text-blue-700 font-medium mt-1">
                  Atualizar
                </p>
              </div>

              <div className="bg-red-50 rounded-lg p-3 sm:p-4 border border-red-200">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-center text-red-900">
                  {summary.delete}
                </p>
                <p className="text-xs text-center text-red-700 font-medium mt-1">
                  Eliminar
                </p>
              </div>
            </div>

            {/* Non-Destructive Sync Info */}
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <AlertDescription className="text-xs sm:text-sm text-blue-900">
                <span className="font-semibold">
                  Sincronização não destrutiva:
                </span>{" "}
                Apenas eventos relacionados com turnos serão modificados. Os
                seus outros eventos de calendário permanecem inalterados.
              </AlertDescription>
            </Alert>

            {/* Warning for deletions */}
            {summary.delete > 0 && (
              <Alert
                variant="destructive"
                className="bg-amber-50 border-amber-300"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <AlertDescription className="text-xs sm:text-sm text-amber-900">
                  {summary.delete} evento{summary.delete !== 1 ? "s" : ""} de
                  turno será{summary.delete !== 1 ? "ão" : ""} removido
                  {summary.delete !== 1 ? "s" : ""} do seu calendário.
                </AlertDescription>
              </Alert>
            )}

            {constraintWarnings.length > 0 && (
              <Alert className="bg-amber-50 border-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <AlertDescription className="text-xs sm:text-sm text-amber-900 space-y-2">
                  <p className="font-semibold">
                    Regras 6/60: foram detetadas possiveis violacoes neste
                    horario.
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {constraintWarnings.map((violation, index) => (
                      <li key={`${violation.code}-${index}`}>
                        {violation.message}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Pode continuar a sincronizacao, mas recomenda-se confirmar
                    estes turnos antes de aplicar alteracoes.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Total Changes Summary */}
            <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs sm:text-sm text-slate-900">
                  Total de Alterações
                </span>
                <span className="text-xl sm:text-2xl font-bold text-slate-900">
                  {totalChanges}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>Sem alterações (noop): {summary.noop ?? 0}</span>
                <span>Falhas previstas: {summary.failed ?? 0}</span>
              </div>
            </div>

            {/* Detailed preview list */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs sm:text-sm text-slate-900">
                  Pré-visualização de alterações
                </span>
                <span className="text-xs text-slate-500">
                  {visibleChanges.length}/
                  {Math.max(
                    changes.filter((item) => item.type !== "noop").length,
                    0,
                  )}
                </span>
              </div>

              {visibleChanges.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Sem alterações materiais para aplicar.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {visibleChanges.map((item, index) => {
                    const badgeClass =
                      item.type === "create"
                        ? "bg-green-100 text-green-700"
                        : item.type === "update"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700";

                    return (
                      <div
                        key={`${item.syncShiftKey ?? "unknown"}-${index}`}
                        className="rounded-md border border-slate-200 px-2 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${badgeClass}`}
                          >
                            {item.type}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate">
                            {item.date ?? "sem data"}
                          </span>
                        </div>

                        <p className="text-xs text-slate-800 mt-1 truncate">
                          {item.title ?? "Evento de turno"}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.location ?? "Sem localização"}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {item.start
                            ? new Date(item.start).toLocaleString()
                            : "-"}{" "}
                          -{" "}
                          {item.end ? new Date(item.end).toLocaleString() : "-"}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canSync}
              className="w-full sm:w-auto font-semibold text-xs sm:text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4 text-white" />A sincronizar...
                </span>
              ) : (
                `Confirmar e Sincronizar ${totalChanges} Alteração${totalChanges !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Calendar Dialog */}
      <CreateCalendarDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateCalendar}
        loading={creatingCalendar}
      />
    </>
  );
}
