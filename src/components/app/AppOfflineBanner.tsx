import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function AppOfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-[60] border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>
          Está offline. Algumas ações podem ficar indisponíveis até a ligação
          ser restabelecida.
        </span>
      </div>
    </div>
  );
}
