/**
 * src/components/swaps/hr-settings-modal.tsx
 *
 * Modal form for configuring HR email settings.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BackendServices } from "@/services/backend/types";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { HRSettings } from "@/types/domain";

interface HRSettingsModalProps {
  isOpen: boolean;
  userId: string;
  backend: Pick<BackendServices, "swaps">;
  onClose: () => void;
  onSaved: (settings: HRSettings) => void;
}

export function HRSettingsModal({
  isOpen,
  userId,
  backend,
  onClose,
  onSaved,
}: HRSettingsModalProps) {
  const [hrEmail, setHrEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [selectedCalendarName, setSelectedCalendarName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        const settings = await backend.swaps.getHRSettings(userId);
        if (settings) {
          setHrEmail(settings.hrEmail);
          setCcEmails(settings.ccEmails.join(", "));
          setSelectedCalendarId(settings.selectedCalendarId ?? "");
          setSelectedCalendarName(settings.selectedCalendarName ?? "");
        }
      } catch (err) {
        setError(getErrorMessage(err));
      }
    };

    void loadSettings();
  }, [isOpen, userId, backend.swaps]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!hrEmail.trim()) {
        throw new Error("HR email is required");
      }

      const cc = ccEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      const settings = await backend.swaps.saveHRSettings({
        userId,
        hrEmail: hrEmail.trim(),
        ccEmails: cc,
        selectedCalendarId: selectedCalendarId.trim() || null,
        selectedCalendarName: selectedCalendarName.trim() || null,
      });

      setSuccess("HR settings saved successfully");
      onSaved(settings);
      setTimeout(onClose, 1000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Definicoes de RH
          </h2>
          <p className="text-sm text-slate-600">
            Configure para onde os pedidos serao enviados
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Email de RH *
            </label>
            <input
              type="email"
              value={hrEmail}
              onChange={(e) => setHrEmail(e.target.value)}
              placeholder="rh@empresa.com"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Emails em CC (separados por virgula)
            </label>
            <input
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="gerente@empresa.com, supervisor@empresa.com"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-slate-500">
              Deixe vazio se nao precisar de CC
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              ID do calendario alvo (opcional)
            </label>
            <input
              type="text"
              value={selectedCalendarId}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
              placeholder="primary ou id@group.calendar.google.com"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Nome do calendario alvo (opcional)
            </label>
            <input
              type="text"
              value={selectedCalendarName}
              onChange={(e) => setSelectedCalendarName(e.target.value)}
              placeholder="Calendario Principal"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="flex-1">
            {loading ? "A guardar..." : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
