import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface CreateCalendarDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    timeZone: string,
    description?: string,
  ) => Promise<void>;
  loading?: boolean;
}

const TIMEZONES = [
  { value: "Europe/Lisbon", label: "Europa/Lisboa (WET)" },
  { value: "Europe/London", label: "Europa/Londres (GMT/BST)" },
  { value: "Europe/Paris", label: "Europa/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europa/Berlim (CET)" },
  { value: "Europe/Madrid", label: "Europa/Madrid (CET)" },
  { value: "America/New_York", label: "América/Nova Iorque (EST)" },
  { value: "America/Los_Angeles", label: "América/Los Angeles (PST)" },
  { value: "UTC", label: "UTC" },
];

export function CreateCalendarDialog({
  open,
  onClose,
  onCreate,
  loading,
}: CreateCalendarDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeZone, setTimeZone] = useState("Europe/Lisbon");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("O nome do calendário é obrigatório");
      return;
    }

    setError(null);
    await onCreate(name.trim(), timeZone, description.trim() || undefined);
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setTimeZone("Europe/Lisbon");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Calendar className="w-5 h-5" />
            Criar Novo Calendário
          </DialogTitle>
          <DialogDescription>
            Crie um novo Google Calendar para o seu horário de turnos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-name">Nome do Calendário *</Label>
            <Input
              id="calendar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex., Turnos de Trabalho"
              disabled={loading}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-description">Descrição (opcional)</Label>
            <Textarea
              id="calendar-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ex., O meu horário de turnos de trabalho sincronizado do Excel"
              rows={2}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-timezone">Fuso Horário</Label>
            <Select
              value={timeZone}
              onValueChange={setTimeZone}
              disabled={loading}
            >
              <SelectTrigger id="calendar-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="w-full sm:w-auto font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner className="size-4 text-white" />A criar...
              </span>
            ) : (
              "Criar Calendário"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
