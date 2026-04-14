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
import { CalendarCheck2, Mail, UserRound } from "lucide-react";

interface ProfileSettingsDialogProps {
  open: boolean;
  initialEmail: string;
  initialFullName?: string | null;
  initialEmployeeCode?: string | null;
  initialHrEmail?: string | null;
  initialCcEmails?: string[] | null;
  accessToken?: string | null;
  initialDefaultCalendarId?: string | null;
  initialDefaultCalendarName?: string | null;
  lastUpdatedAt?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    fullName: string;
    employeeCode: string;
    email: string;
    hrEmail: string;
    ccEmails: string[];
    defaultCalendarId: string | null;
    defaultCalendarName: string | null;
  }) => Promise<void>;
}

export function ProfileSettingsDialog({
  open,
  initialEmail,
  initialFullName,
  initialEmployeeCode,
  initialHrEmail,
  initialCcEmails,
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
  const [hrEmail, setHrEmail] = useState(initialHrEmail ?? "");
  const [ccEmailsText, setCcEmailsText] = useState(
    (initialCcEmails ?? []).join(", "),
  );
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
    setHrEmail(initialHrEmail ?? "");
    setCcEmailsText((initialCcEmails ?? []).join(", "));
    setDefaultCalendarId(initialDefaultCalendarId ?? null);
    setDefaultCalendarName(initialDefaultCalendarName ?? null);
  }, [
    initialEmail,
    initialFullName,
    initialEmployeeCode,
    initialHrEmail,
    initialCcEmails,
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

  const normalizedHrEmail = hrEmail.trim();
  const normalizedCcEmails = ccEmailsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const isEmailLike = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const hasInvalidCc = normalizedCcEmails.some((value) => !isEmailLike(value));
  const hasInvalidHr =
    normalizedHrEmail.length > 0 && !isEmailLike(normalizedHrEmail);

  const canSave =
    fullName.trim().length > 1 &&
    employeeCode.trim().length > 0 &&
    email.trim().includes("@") &&
    !hasInvalidHr &&
    !hasInvalidCc;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <DialogTitle>Configurações de perfil</DialogTitle>
          <DialogDescription>
            Personalize os dados de perfil, contactos de RH e preferências de
            calendário.
          </DialogDescription>
          {lastUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Ultima atualizacao: {new Date(lastUpdatedAt).toLocaleString()}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Perfil</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
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
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Contactos RH
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">
                  Email principal RH
                </label>
                <Input
                  type="email"
                  value={hrEmail}
                  onChange={(e) => setHrEmail(e.target.value)}
                  placeholder="rh@empresa.com"
                />
                {hasInvalidHr ? (
                  <p className="mt-1 text-xs text-rose-600">
                    Introduza um email RH valido.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium">
                  Emails em CC (separados por virgula)
                </label>
                <Input
                  value={ccEmailsText}
                  onChange={(e) => setCcEmailsText(e.target.value)}
                  placeholder="gestor@empresa.com, chefe@empresa.com"
                />
                {hasInvalidCc ? (
                  <p className="mt-1 text-xs text-rose-600">
                    Um ou mais emails em CC sao invalidos.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estas definicoes sao usadas por Ausencias e Trocas.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Calendario
              </h3>
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
          </section>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
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
                  hrEmail: normalizedHrEmail,
                  ccEmails: normalizedCcEmails,
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
