import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoogleCalendarService } from "@/lib/google-calendar";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { GoogleCalendar } from "@/types/shift";

interface ProfileSettingsDialogProps {
  open: boolean;
  initialEmail: string;
  initialFullName?: string | null;
  initialEmployeeCode?: string | null;
  accessToken?: string | null;
  initialDefaultCalendarId?: string | null;
  initialDefaultCalendarName?: string | null;
  lastUpdatedAt?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    fullName: string;
    employeeCode: string;
    email: string;
    defaultCalendarId: string | null;
    defaultCalendarName: string | null;
  }) => Promise<void>;
}

export function ProfileSettingsDialog({
  open,
  initialEmail,
  initialFullName,
  initialEmployeeCode,
  accessToken,
  initialDefaultCalendarId,
  initialDefaultCalendarName,
  lastUpdatedAt,
  onOpenChange,
  onSave,
}: ProfileSettingsDialogProps) {
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [employeeCode, setEmployeeCode] = useState(initialEmployeeCode ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [defaultCalendarId, setDefaultCalendarId] = useState<string | null>(
    initialDefaultCalendarId ?? null,
  );
  const [defaultCalendarName, setDefaultCalendarName] = useState<string | null>(
    initialDefaultCalendarName ?? null,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(initialFullName ?? "");
    setEmployeeCode(initialEmployeeCode ?? "");
    setEmail(initialEmail);
    setDefaultCalendarId(initialDefaultCalendarId ?? null);
    setDefaultCalendarName(initialDefaultCalendarName ?? null);
  }, [
    initialEmail,
    initialFullName,
    initialEmployeeCode,
    initialDefaultCalendarId,
    initialDefaultCalendarName,
    open,
  ]);

  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    const loadCalendars = async () => {
      setCalendarLoading(true);
      setCalendarError(null);

      try {
        const service = new GoogleCalendarService(accessToken);
        const list = await service.listCalendars();
        setCalendars(list);

        if (!defaultCalendarId) {
          const primary = list.find((calendar) => calendar.primary);
          if (primary) {
            setDefaultCalendarId(primary.id);
            setDefaultCalendarName(primary.summary ?? null);
          }
        }
      } catch (error) {
        setCalendarError(getErrorMessage(error));
      } finally {
        setCalendarLoading(false);
      }
    };

    void loadCalendars();
  }, [open, accessToken]);

  const canSave =
    fullName.trim().length > 1 &&
    employeeCode.trim().length > 0 &&
    email.trim().includes("@");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de perfil</DialogTitle>
          <DialogDescription>
            Atualize os seus identificadores pessoais a qualquer momento.
          </DialogDescription>
          {lastUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Ultima atualizacao: {new Date(lastUpdatedAt).toLocaleString()}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nome completo</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome completo"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium">Employee ID</label>
            <Input
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="Ex: EMP12345"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Calendario padrao</label>
            <Select
              value={defaultCalendarId ?? undefined}
              onValueChange={(id) => {
                const selected = calendars.find(
                  (calendar) => calendar.id === id,
                );
                setDefaultCalendarId(id);
                setDefaultCalendarName(selected?.summary ?? null);
              }}
              disabled={
                !accessToken || calendarLoading || calendars.length === 0
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    !accessToken
                      ? "Ligue a conta Google para escolher"
                      : calendarLoading
                        ? "A carregar calendarios..."
                        : "Selecione um calendario"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {calendarError ? (
              <p className="mt-1 text-xs text-rose-600">{calendarError}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Este calendario sera usado por defeito nas sincronizacoes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (!canSave) return;
              setSaving(true);
              try {
                await onSave({
                  fullName: fullName.trim(),
                  employeeCode: employeeCode.trim(),
                  email: email.trim(),
                  defaultCalendarId,
                  defaultCalendarName,
                });
              } finally {
                setSaving(false);
              }
            }}
            disabled={!canSave || saving}
          >
            {saving ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
