import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { AuthCard } from "@/components/auth/auth-card";
import { FirstLoginProfileDialog } from "@/components/auth/FirstLoginProfileDialog";
import { ProfileSettingsDialog } from "@/components/auth/ProfileSettingsDialog";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { CalendarSelector } from "@/components/calendar/calendar-selector";
import { FileUploadZone } from "@/components/upload/file-upload-zone";
import { SharedScheduleRecoveryCard } from "@/components/upload/shared-schedule-recovery-card";
import { ShiftPreviewTable } from "@/components/shifts/shift-preview-table";
import { SyncConfirmationModal } from "@/components/sync/sync-confirmation-modal";
import { SuccessModal } from "@/components/sync/success-modal";
import { ShiftData, SyncSummary, ParsedScheduleResult } from "@/types/shift";
import { GoogleCalendarService } from "@/lib/google-calendar";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  getSupabaseSession,
  onSupabaseAuthChange,
  signInWithSupabaseGoogle,
  signOutSupabase,
} from "@/lib/supabase-auth";
import { isSupabaseConfigured } from "@/lib/supabase-client";
import { getBackend } from "@/services/backend/backend-provider";
import { toast } from "sonner";
import Footer from "../components/Footer";
import {
  persistUploadMetadata,
  detectSharedScheduleByHash,
} from "@/features/uploads/services/schedule-upload.service";
import { isSharedRecoveryEnabled } from "@/shared/utils/featureFlags";

import { useConsent } from "@/lib/cookies/ConsentContext";
import { SpeedInsights } from "@vercel/speed-insights/react";

const STORAGE_KEYS = {
  ACCESS_TOKEN: "google_access_token",
  USER_EMAIL: "google_user_email",
};

const PROFILE_ACK_PREFIX = "profile_prompt_ack";
const SESSION_RESTORE_TIMEOUT_MS = 4000;

type AppStep = "auth" | "upload" | "preview" | "confirm" | "success";

function needsProfileCompletion(
  profile: {
    employeeCode: string;
    fullName: string | null;
    email: string | null;
  } | null,
): boolean {
  if (!profile) {
    return true;
  }

  return (
    !profile.employeeCode?.trim() ||
    !profile.fullName?.trim() ||
    !profile.email?.trim()
  );
}

function profileAckKey(userId: string): string {
  return `${PROFILE_ACK_PREFIX}:${userId}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Session restore timed out"));
      }, timeoutMs);
    }),
  ]);
}

function mustShowProfileDialog(
  userId: string,
  profile: {
    employeeCode: string;
    fullName: string | null;
    email: string | null;
  } | null,
): boolean {
  const ack = localStorage.getItem(profileAckKey(userId));
  if (ack !== "1") {
    return true;
  }
  return needsProfileCompletion(profile);
}

function Home() {
  const { hasCategory } = useConsent();
  const backend = getBackend();
  // Authentication state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileInitialName, setProfileInitialName] = useState<string>("");
  const [profileInitialCode, setProfileInitialCode] = useState<string>("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsInitialName, setSettingsInitialName] = useState<string>("");
  const [settingsInitialCode, setSettingsInitialCode] = useState<string>("");
  const [settingsInitialEmail, setSettingsInitialEmail] = useState<string>("");
  const [settingsLastUpdatedAt, setSettingsLastUpdatedAt] = useState<
    string | null
  >(null);

  // Calendar state
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [calendarName, setCalendarName] = useState<string>("");

  // Shifts state
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>("");
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({
    create: 0,
    update: 0,
    delete: 0,
  });

  // UI state
  const [currentStep, setCurrentStep] = useState<AppStep>("auth");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadUserProfile = async (userId: string) => {
    try {
      const profile = await withTimeout(
        backend.users.getUserProfile(userId),
        SESSION_RESTORE_TIMEOUT_MS,
      );

      if (mustShowProfileDialog(userId, profile)) {
        setProfileInitialName(profile?.fullName ?? "");
        setProfileInitialCode(profile?.employeeCode ?? "");
        setProfileDialogOpen(true);
      }
    } catch (error) {
      console.warn("[ShiftSync] Profile bootstrap skipped:", error);
    }
  };

  // Restore session from Supabase (preferred) or localStorage fallback on mount.
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        if (isSupabaseConfigured) {
          const session = await withTimeout(
            getSupabaseSession(),
            SESSION_RESTORE_TIMEOUT_MS,
          );

          if (session?.user) {
            const providerAccessToken = session.provider_token || null;
            const email = session.user.email || "";
            const userId = session.user.id;

            setAccessToken(providerAccessToken);
            setUserEmail(email);
            setCurrentUserId(userId);
            setCurrentStep("upload");

            void loadUserProfile(userId);

            if (providerAccessToken) {
              localStorage.setItem(
                STORAGE_KEYS.ACCESS_TOKEN,
                providerAccessToken,
              );
            }
            localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);

            return;
          }
        }

        const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        const storedEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);

        if (storedToken && storedEmail) {
          await validateAndRestoreSession(storedToken, storedEmail);
        }
      } catch {
        clearSession();
      } finally {
        if (mounted) {
          setIsRestoringSession(false);
        }
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    return onSupabaseAuthChange(async (_event, session) => {
      if (!session?.user) {
        return;
      }

      setUserEmail(session.user.email || "");
      setAccessToken(session.provider_token || null);
      setCurrentUserId(session.user.id);
      setCurrentStep("upload");

      void loadUserProfile(session.user.id);
    });
  }, [backend.users]);

  const validateAndRestoreSession = async (token: string, email: string) => {
    try {
      // Validate token by fetching user info
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        setAccessToken(token);
        setUserEmail(email);
        setCurrentStep("upload");
      } else {
        // Token is invalid/expired, clear storage
        clearSession();
        toast.error("Sessão expirada, por favor inicie sessão novamente");
      }
    } catch {
      // Network error or token invalid
      clearSession();
    } finally {
      setIsRestoringSession(false);
    }
  };

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    setAccessToken(null);
    setUserEmail("");
    setCurrentUserId(null);
    setProfileDialogOpen(false);
    setCurrentStep("auth");
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const token = tokenResponse.access_token;
        setAccessToken(token);

        // Fetch user info
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!userInfoResponse.ok) {
          throw new Error("Falha ao obter informações do utilizador");
        }

        const userInfo = await userInfoResponse.json();
        const email = userInfo.email || "";
        setUserEmail(email);

        // Persist to localStorage
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
        localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);

        setCurrentStep("upload");
        setAuthLoading(false);
        toast.success("Autenticação bem-sucedida!");
      } catch (err) {
        setAuthLoading(false);
        toast.error("Falha na autenticação: " + getErrorMessage(err));
      }
    },
    onError: (error) => {
      setAuthLoading(false);
      toast.error("Falha no login Google: " + getErrorMessage(error));
    },
    scope: "openid email profile https://www.googleapis.com/auth/calendar",
  });

  const handleSignIn = async (gdprConsent: boolean) => {
    if (!gdprConsent) return;

    setAuthLoading(true);

    if (isSupabaseConfigured) {
      try {
        const oauthUrl = await signInWithSupabaseGoogle();
        window.location.assign(oauthUrl);
      } catch (error) {
        setAuthLoading(false);
        toast.error(
          "Falha no login Supabase/Google: " + getErrorMessage(error),
        );
      }

      return;
    }

    googleLogin();
  };

  const handleFileProcessed = async (
    processedShifts: ShiftData[],
    employeeName?: string,
    context?: {
      sourceFile: File;
      parsedResult: ParsedScheduleResult;
      consentToShare: boolean;
    },
  ) => {
    setShifts(processedShifts);
    setSelectedEmployeeName(employeeName || "");
    setCurrentStep("preview");

    if (context && currentUserId) {
      try {
        const upload = await persistUploadMetadata({
          userId: currentUserId,
          file: context.sourceFile,
          consentToShare: context.consentToShare,
          parsedResult: context.parsedResult,
          selectedEmployeeName: employeeName,
          selectedEmployeeShifts: processedShifts,
        });

        const shared = await detectSharedScheduleByHash(upload.fileHash);
        if (shared.isShared) {
          toast.info(
            `Upload partilhado detectado (${shared.matchingCount} correspondências consentidas).`,
          );
        }
      } catch (error) {
        toast.warning(
          `Upload persistido parcialmente: ${getErrorMessage(error)}`,
        );
      }
    }

    toast.success(
      `${processedShifts.length} turnos carregados com sucesso!${employeeName ? ` (${employeeName})` : ""}`,
    );
  };

  const handlePreviewConfirm = () => {
    // Calculate sync summary
    const summary: SyncSummary = {
      create: shifts.filter((s) => s.status === "active").length,
      update: shifts.filter((s) => s.status === "modified").length,
      delete: shifts.filter((s) => s.status === "deleted").length,
    };

    setSyncSummary(summary);
    setShowConfirmModal(true);
  };

  const handleSync = async (calendarId: string, calendarSummary?: string) => {
    if (!accessToken || !calendarId) return;

    setSyncing(true);

    try {
      const service = new GoogleCalendarService(accessToken);

      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i];

        if (shift.status === "active") {
          await service.createEvent(calendarId, shift);
        } else if (shift.status === "modified") {
          if (shift.googleEventId) {
            await service.updateEvent(calendarId, shift.googleEventId, shift);
          } else {
            toast.warning(
              `Turno em ${shift.date} ignorado: sem ID de evento para atualização`,
            );
          }
        } else if (shift.status === "deleted") {
          if (shift.googleEventId) {
            await service.deleteEvent(calendarId, shift.googleEventId);
          } else {
            toast.warning(
              `Turno em ${shift.date} ignorado: sem ID de evento para eliminação`,
            );
          }
        }
      }

      // Update selected calendar state for success modal
      setSelectedCalendar(calendarId);
      if (calendarSummary) {
        setCalendarName(calendarSummary);
      }

      setShowConfirmModal(false);
      setShowSuccessModal(true);
      toast.success("Calendário sincronizado com sucesso!");
    } catch (err) {
      toast.error("Falha ao sincronizar calendário: " + getErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleNewSync = () => {
    setShifts([]);
    setSelectedEmployeeName("");
    setShowSuccessModal(false);
    setCurrentStep("upload");
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      try {
        await signOutSupabase();
      } catch (error) {
        toast.error(
          "Falha ao terminar sessão Supabase: " + getErrorMessage(error),
        );
      }
    }

    clearSession();
    setSelectedCalendar(null);
    setShifts([]);
    toast.info("Sessão terminada com sucesso");
  };

  const handleTokenExpired = () => {
    clearSession();
    toast.error("Sessão expirada, por favor inicie sessão novamente");
  };

  const handleOpenSettings = async () => {
    if (!currentUserId) {
      toast.error("Sessão de utilizador não encontrada");
      return;
    }

    try {
      const profile = await backend.users.getUserProfile(currentUserId);
      setSettingsInitialName(profile?.fullName ?? "");
      setSettingsInitialCode(profile?.employeeCode ?? "");
      setSettingsInitialEmail(profile?.email ?? userEmail);
      setSettingsLastUpdatedAt(profile?.updatedAt ?? null);
      setSettingsDialogOpen(true);
    } catch (error) {
      toast.error(`Falha ao carregar perfil: ${getErrorMessage(error)}`);
    }
  };

  // Show loading while restoring session
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">A restaurar sessão...</p>
        </div>
      </div>
    );
  }

  // Authentication screen
  if (currentStep === "auth") {
    return <AuthCard onSignIn={handleSignIn} loading={authLoading} />;
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-3 sm:p-4 md:p-6 lg:p-8 max-w-6xl space-y-4 sm:space-y-6">
        <DashboardHeader
          email={userEmail}
          onLogout={handleLogout}
          onOpenSettings={handleOpenSettings}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            <CalendarSelector
              accessToken={accessToken || ""}
              selectedCalendar={selectedCalendar}
              onSelectCalendar={(id, name) => {
                setSelectedCalendar(id);
                setCalendarName(name || "O Meu Calendário");
              }}
              onTokenExpired={handleTokenExpired}
            />

            {(currentStep === "upload" || currentStep === "preview") && (
              <FileUploadZone
                onFileProcessed={handleFileProcessed}
                disabled={false}
              />
            )}

            {isSharedRecoveryEnabled() && currentUserId && (
              <SharedScheduleRecoveryCard userId={currentUserId} />
            )}
          </div>

          <div className="lg:col-span-2">
            {currentStep === "preview" && shifts.length > 0 && (
              <ShiftPreviewTable
                shifts={shifts}
                onConfirm={handlePreviewConfirm}
                employeeName={selectedEmployeeName}
              />
            )}
          </div>
        </div>

        {/* Modals */}
        <SyncConfirmationModal
          open={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleSync}
          summary={syncSummary}
          loading={syncing}
          accessToken={accessToken || ""}
          initialCalendarId={selectedCalendar}
          onTokenExpired={handleTokenExpired}
        />

        <SuccessModal
          open={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
          onNewSync={handleNewSync}
          summary={syncSummary}
          calendarName={calendarName}
        />

        <FirstLoginProfileDialog
          open={profileDialogOpen}
          initialEmail={userEmail}
          initialFullName={profileInitialName}
          initialEmployeeCode={profileInitialCode}
          onSave={async ({ fullName, employeeCode, email }) => {
            if (!currentUserId) {
              throw new Error("User session not found");
            }
            await backend.users.updateUserProfile(currentUserId, {
              fullName,
              employeeCode,
              email,
            });
            localStorage.setItem(profileAckKey(currentUserId), "1");
            setUserEmail(email);
            setProfileDialogOpen(false);
            toast.success("Perfil atualizado com sucesso");
          }}
        />

        <ProfileSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          initialEmail={settingsInitialEmail}
          initialFullName={settingsInitialName}
          initialEmployeeCode={settingsInitialCode}
          lastUpdatedAt={settingsLastUpdatedAt}
          onSave={async ({ fullName, employeeCode, email }) => {
            if (!currentUserId) {
              throw new Error("User session not found");
            }

            const updatedProfile = await backend.users.updateUserProfile(
              currentUserId,
              {
                fullName,
                employeeCode,
                email,
              },
            );

            setUserEmail(email);
            setSettingsInitialName(fullName);
            setSettingsInitialCode(employeeCode);
            setSettingsInitialEmail(email);
            setSettingsLastUpdatedAt(updatedProfile.updatedAt);
            setProfileInitialName(fullName);
            setProfileInitialCode(employeeCode);
            setSettingsDialogOpen(false);
            toast.success("Perfil atualizado nas configurações");
          }}
        />
      </div>
      {hasCategory("analytics") && <SpeedInsights />}
      <SpeedInsights />
      <Footer />
    </div>
  );
}

export default Home;
