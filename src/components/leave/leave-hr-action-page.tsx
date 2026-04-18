/**
 * LeaveHRActionPage
 *
 * Landing page for HR managers clicking approve/decline/adjust links from
 * leave-request notification emails.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LeaveService } from "@/services/backend/types";
import { Button } from "@/components/ui/button";

interface LeaveHRActionPageProps {
  service: LeaveService;
}

type PageState = "loading" | "success" | "error" | "invalid";

export function LeaveHRActionPage({ service }: LeaveHRActionPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const action = searchParams.get("action") ?? "";

  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!token || !["approve", "decline", "adjust"].includes(action)) {
      setState("invalid");
      return;
    }

    let mounted = true;

    const perform = async () => {
      try {
        await service.processLeaveDecisionAction({
          token,
          action: action as "approve" | "decline" | "adjust",
        });
        if (mounted) setState("success");
      } catch (err) {
        if (!mounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Erro desconhecido.",
        );
        setState("error");
      }
    };

    void perform();

    return () => {
      mounted = false;
    };
  }, [token, action, service]);

  const actionLabel =
    action === "approve"
      ? "aprovado"
      : action === "decline"
        ? "recusado"
        : "marcado para ajustes";

  const actionColor =
    action === "approve"
      ? "text-emerald-700"
      : action === "decline"
        ? "text-rose-700"
        : "text-amber-700";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] space-y-6 text-center">
        {state === "loading" && (
          <>
            <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin mx-auto" />
            <p className="text-sm text-slate-600">
              A processar a sua decisão&hellip;
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <div
              className={`text-5xl font-bold ${actionColor}`}
              aria-label={`Pedido ${actionLabel}`}
            >
              {action === "approve" ? "✓" : action === "decline" ? "✕" : "!"}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Pedido {actionLabel}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                A decisão foi registada com sucesso no ShiftSync.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.close()}>
              Fechar
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <div
              className="text-5xl font-bold text-amber-500"
              aria-label="Erro"
            >
              ⚠
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Não foi possível processar
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {errorMessage ||
                  "O link pode ter expirado ou já ter sido utilizado."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.close()}>
              Fechar
            </Button>
          </>
        )}

        {state === "invalid" && (
          <>
            <div
              className="text-5xl font-bold text-rose-500"
              aria-label="Link inválido"
            >
              ✕
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Link inválido
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                O link de decisão está incompleto. Verifique o email e tente
                novamente.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
