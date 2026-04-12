import { Button } from "@/components/ui/button";

interface SwapAvailabilityToggleProps {
  isOpen: boolean;
  loading?: boolean;
  onToggle: () => void;
}

export function SwapAvailabilityToggle({
  isOpen,
  loading = false,
  onToggle,
}: SwapAvailabilityToggleProps) {
  return (
    <Button
      variant={isOpen ? "outline" : "default"}
      size="sm"
      disabled={loading}
      onClick={onToggle}
      className="w-full"
    >
      {isOpen ? "Fechar Troca" : "Abrir para Troca"}
    </Button>
  );
}
