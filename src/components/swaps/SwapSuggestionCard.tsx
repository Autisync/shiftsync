import { motion } from "framer-motion";
import { Clock3, TriangleAlert, User, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";

interface SwapSuggestionCardProps {
  match: RankedSwapMatch;
  targetUserDisplayName?: string;
  disabled?: boolean;
  onSendRequest: (match: RankedSwapMatch) => void;
}

export function SwapSuggestionCard({
  match,
  targetUserDisplayName,
  disabled = false,
  onSendRequest,
}: SwapSuggestionCardProps) {
  const overlap = Math.max(
    0,
    Math.round(
      (Math.min(
        new Date(match.ownShift.endsAt).getTime(),
        new Date(match.targetShift.endsAt).getTime(),
      ) -
        Math.max(
          new Date(match.ownShift.startsAt).getTime(),
          new Date(match.targetShift.startsAt).getTime(),
        )) /
        (1000 * 60 * 60),
    ),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_6px_20px_-18px_rgba(15,23,42,0.45)]"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">
          Pontuacao {match.score}
        </p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {match.strategy}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-slate-600">
        <p className="flex items-center gap-1">
          <User className="h-3 w-3" /> Utilizador{" "}
          {targetUserDisplayName ?? match.targetShift.userId.slice(0, 8)}
        </p>
        <p className="flex items-center gap-1">
          <Clock3 className="h-3 w-3" /> Sobreposicao: {overlap}h
        </p>
        <p>
          Diferenca de duracao:{" "}
          {Math.abs(
            new Date(match.ownShift.endsAt).getTime() -
              new Date(match.ownShift.startsAt).getTime() -
              (new Date(match.targetShift.endsAt).getTime() -
                new Date(match.targetShift.startsAt).getTime()),
          ) /
            (1000 * 60 * 60)}
          h
        </p>
        {match.rationale.length > 0 ? (
          <p className="flex items-center gap-1 text-amber-700">
            <TriangleAlert className="h-3 w-3" /> {match.rationale[0]}
          </p>
        ) : null}
      </div>
      <Button
        size="sm"
        className="mt-3 w-full"
        disabled={disabled}
        onClick={() => onSendRequest(match)}
      >
        <Send className="mr-1 h-3 w-3" />
        Enviar Pedido de Troca
      </Button>
    </motion.div>
  );
}
