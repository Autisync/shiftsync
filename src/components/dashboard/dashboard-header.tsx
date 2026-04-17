import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Settings,
  History,
  User,
  Shuffle,
  LayoutDashboard,
  CalendarDays,
} from "lucide-react";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { NotificationService } from "@/services/backend/types";

interface DashboardHeaderProps {
  displayName: string;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenSwaps?: () => void;
  onOpenLeave?: () => void;
  onOpenHistory?: () => void;
  onOpenDashboard?: () => void;
  activeSection?: "home" | "swaps" | "leave" | "history" | "notifications";
  leaveEnabled?: boolean;
  userId?: string;
  notificationService?: NotificationService;
  onOpenNotifications?: () => void;
}

export function DashboardHeader({
  displayName,
  onLogout,
  onOpenSettings,
  onOpenSwaps,
  onOpenLeave,
  onOpenHistory,
  onOpenDashboard,
  activeSection = "home",
  leaveEnabled = false,
  userId,
  notificationService,
  onOpenNotifications,
}: DashboardHeaderProps) {
  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-slate-50">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">
                Seja bem-vindo!
              </CardTitle>
              <CardDescription className="text-sm sm:text-base truncate">
                {displayName}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-0.5 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <Button
              variant={activeSection === "home" ? "default" : "outline"}
              size="sm"
              onClick={onOpenDashboard}
              className="shrink-0 gap-1.5"
              aria-label="Painel"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Painel</span>
            </Button>
            <Button
              variant={activeSection === "swaps" ? "default" : "outline"}
              size="sm"
              onClick={onOpenSwaps}
              className="shrink-0 gap-1.5"
              aria-label="Ver Trocas"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">Ver Trocas</span>
            </Button>
            <Button
              variant={activeSection === "leave" ? "default" : "outline"}
              size="sm"
              onClick={onOpenLeave}
              disabled={!leaveEnabled}
              className="shrink-0 gap-1.5"
              aria-label="Ver Ausências"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Ver Ausências</span>
            </Button>
            <Button
              variant={activeSection === "history" ? "default" : "outline"}
              size="sm"
              onClick={onOpenHistory}
              className="shrink-0 gap-1.5"
              aria-label="Recuperar"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Recuperar</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="shrink-0 gap-1.5"
              aria-label="Configurações"
            >
              <Settings className="w-4 h-4" />
            </Button>
            {userId && notificationService && (
              <NotificationBell
                userId={userId}
                notifications={notificationService}
                onOpenAll={onOpenNotifications ?? (() => undefined)}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="shrink-0 gap-1.5"
              aria-label="Sair"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
