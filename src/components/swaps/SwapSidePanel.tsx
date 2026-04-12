import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SwapAvailabilityToggle } from "@/components/swaps/SwapAvailabilityToggle";
import { SwapSuggestionCard } from "@/components/swaps/SwapSuggestionCard";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";
import type { Shift } from "@/types/domain";
import { useIsMobile } from "@/hooks/use-mobile";

interface SwapSidePanelProps {
  open: boolean;
  selectedShift: Shift | null;
  isOpenForSwap: boolean;
  loading?: boolean;
  suggestions: RankedSwapMatch[];
  userDisplayNames?: Record<string, string>;
  onClose: () => void;
  onToggleAvailability: (shiftId: string) => void;
  onSendRequest: (match: RankedSwapMatch) => void;
}

function PanelBody({
  selectedShift,
  isOpenForSwap,
  loading,
  suggestions,
  userDisplayNames,
  onToggleAvailability,
  onSendRequest,
}: Omit<SwapSidePanelProps, "open" | "onClose">) {
  if (!selectedShift) return null;

  const durationHours = Math.round(
    (new Date(selectedShift.endsAt).getTime() -
      new Date(selectedShift.startsAt).getTime()) /
      (1000 * 60 * 60),
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          O Seu Turno
        </p>
        <p className="text-xs text-slate-600">
          {new Date(selectedShift.startsAt).toLocaleDateString("pt-PT")}{" "}
          {new Date(selectedShift.startsAt).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" - "}
          {new Date(selectedShift.endsAt).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <p className="text-xs text-slate-500">Duracao: {durationHours}h</p>
        <div className="mt-3">
          <SwapAvailabilityToggle
            isOpen={isOpenForSwap}
            loading={loading}
            onToggle={() => onToggleAvailability(selectedShift.id)}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Sugestoes de Troca
        </p>
        <div className="mt-2 space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ainda nao existem sugestoes para este turno.
            </p>
          ) : (
            suggestions
              .slice(0, 8)
              .map((match) => (
                <SwapSuggestionCard
                  key={`${match.ownShift.id}-${match.targetShift.id}`}
                  match={match}
                  targetUserDisplayName={
                    userDisplayNames?.[match.targetShift.userId]
                  }
                  onSendRequest={onSendRequest}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
}

export function SwapSidePanel(props: SwapSidePanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer
        open={props.open}
        onOpenChange={(open) => !open && props.onClose()}
      >
        <DrawerContent className="max-h-[85vh] overflow-y-auto p-4">
          <DrawerHeader>
            <DrawerTitle>Detalhes da Troca</DrawerTitle>
            <DrawerDescription>
              Gerir disponibilidade e enviar pedidos.
            </DrawerDescription>
          </DrawerHeader>
          <PanelBody {...props} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes da Troca</DialogTitle>
          <DialogDescription>
            Gerir disponibilidade e enviar pedidos.
          </DialogDescription>
        </DialogHeader>
        <PanelBody {...props} />
        <div className="flex justify-end">
          <Button variant="outline" onClick={props.onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
