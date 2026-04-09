import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link2, ShieldCheck } from "lucide-react";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  recoverSharedSchedule,
  requestSharedScheduleAccess,
} from "@/features/uploads/services/shared-recovery.service";

interface SharedScheduleRecoveryCardProps {
  userId: string;
  disabled?: boolean;
}

export function SharedScheduleRecoveryCard({
  userId,
  disabled,
}: SharedScheduleRecoveryCardProps) {
  const [sharedUploadId, setSharedUploadId] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleRequestAndRecover = async () => {
    if (!sharedUploadId.trim() || !consentGiven) {
      setIsError(true);
      setMessage(
        "Confirme o consentimento e informe o ID do upload partilhado.",
      );
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await requestSharedScheduleAccess({
        scheduleUploadId: sharedUploadId.trim(),
        requesterUserId: userId,
        consentGiven: true,
      });

      const response = await recoverSharedSchedule({
        sharedUploadId: sharedUploadId.trim(),
        receiverUserId: userId,
      });

      setIsError(!response.success);
      setMessage(response.message || "Recuperação concluída.");
    } catch (error) {
      setIsError(true);
      setMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Link2 className="w-4 h-4 sm:w-5 sm:h-5" />
          Recuperar horário partilhado
        </CardTitle>
        <CardDescription className="text-sm">
          Solicite acesso e recupere apenas os seus turnos de um upload
          partilhado.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="shared-upload-id">ID do upload partilhado</Label>
          <Input
            id="shared-upload-id"
            value={sharedUploadId}
            onChange={(e) => setSharedUploadId(e.target.value)}
            placeholder="Cole o UUID do schedule_upload"
            disabled={disabled || submitting}
          />
        </div>

        <div className="flex items-start gap-2 rounded-md border p-3 bg-slate-50">
          <Checkbox
            id="receiver-consent"
            checked={consentGiven}
            onCheckedChange={(checked) => setConsentGiven(Boolean(checked))}
            disabled={disabled || submitting}
          />
          <Label htmlFor="receiver-consent" className="text-sm leading-relaxed">
            Confirmo o meu consentimento para recuperar o meu horário deste
            upload e processar os meus dados de turnos.
          </Label>
        </div>

        <Button
          className="w-full"
          onClick={handleRequestAndRecover}
          disabled={disabled || submitting || !sharedUploadId.trim()}
        >
          {submitting ? "A processar..." : "Solicitar e recuperar"}
        </Button>

        {message && (
          <Alert variant={isError ? "destructive" : "default"}>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
