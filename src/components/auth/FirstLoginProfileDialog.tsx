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

interface FirstLoginProfileDialogProps {
  open: boolean;
  initialEmail: string;
  initialFullName?: string | null;
  initialEmployeeCode?: string | null;
  onSave: (values: {
    fullName: string;
    employeeCode: string;
    email: string;
  }) => Promise<void>;
}

export function FirstLoginProfileDialog({
  open,
  initialEmail,
  initialFullName,
  initialEmployeeCode,
  onSave,
}: FirstLoginProfileDialogProps) {
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
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete o seu perfil</DialogTitle>
          <DialogDescription>
            No primeiro acesso, confirme os seus identificadores pessoais para
            garantir o mapeamento correto dos turnos.
          </DialogDescription>
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
            {saving ? "A guardar..." : "Guardar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
