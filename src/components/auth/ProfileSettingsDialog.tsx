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

interface ProfileSettingsDialogProps {
  open: boolean;
  initialEmail: string;
  initialFullName?: string | null;
  initialEmployeeCode?: string | null;
  lastUpdatedAt?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    fullName: string;
    employeeCode: string;
    email: string;
  }) => Promise<void>;
}

export function ProfileSettingsDialog({
  open,
  initialEmail,
  initialFullName,
  initialEmployeeCode,
  lastUpdatedAt,
  onOpenChange,
  onSave,
}: ProfileSettingsDialogProps) {
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [employeeCode, setEmployeeCode] = useState(initialEmployeeCode ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(initialFullName ?? "");
    setEmployeeCode(initialEmployeeCode ?? "");
    setEmail(initialEmail);
  }, [initialEmail, initialFullName, initialEmployeeCode, open]);

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
