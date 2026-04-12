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
  CalendarRange,
  LayoutDashboard,
} from "lucide-react";

interface DashboardHeaderProps {
  email: string;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenSwaps?: () => void;
  onOpenDashboard?: () => void;
  swapsActive?: boolean;
}

export function DashboardHeader({
  email,
  onLogout,
  onOpenSettings,
  onOpenSwaps,
  onOpenDashboard,
  swapsActive = false,
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
                {email}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {swapsActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenDashboard}
                className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
              >
                <LayoutDashboard className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Dashboard</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSwaps}
                className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
              >
                <CalendarRange className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Swap Calendar</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
            >
              <History className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Histórico</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
            >
              <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Configurações</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
            >
              <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Sair</span>
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
