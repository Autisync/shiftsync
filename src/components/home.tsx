import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  getSupabaseSession,
  onSupabaseAuthChange,
  signInWithSupabaseGoogle,
  signOutSupabase,
} from "@/lib/supabase-auth";
import { isSupabaseConfigured } from "@/lib/supabase-client";
import { getBackend } from "@/services/backend/backend-provider";
import type { CalendarSyncRunOptions } from "@/services/backend/types";
import { toast } from "sonner";
import Footer from "../components/Footer";
import {
  persistUploadMetadata,
  detectSharedScheduleByHash,
} from "@/features/uploads/services/schedule-upload.service";
import { isSharedRecoveryEnabled } from "@/shared/utils/featureFlags";

import { useConsent } from "@/lib/cookies/ConsentContext";
import { SpeedInsights } from "@vercel/speed-insights/react";
import type { CalendarSyncPreviewChange } from "@/features/calendar/types";

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

function summarizeShiftInput(shifts: ShiftData[]): {
  total_shifts: number;
  unique_dates: string[];
  rows: Array<{
    date: string;
    start_time: string;
    end_time: string;
    shift_uid: string | null;
  }>;
} {
  const rows = shifts.map((shift) => ({
    date: shift.date.toISOString().slice(0, 10),
    start_time: shift.startTime,
    end_time: shift.endTime,
    shift_uid: shift.shiftUid ?? null,
  }));

  const unique_dates = [...new Set(rows.map((row) => row.date))].sort();

  return {
    total_shifts: shifts.length,
    unique_dates,
    rows,
  };
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
  const navigate = useNavigate();
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
  const [syncSummary, setSyncSummary] = useState<
    SyncSummary & { noop?: number; failed?: number }
  >({
    create: 0,
    update: 0,
    delete: 0,
    noop: 0,
    failed: 0,
  });
  const [previewChanges, setPreviewChanges] = useState<
    CalendarSyncPreviewChange[]
  >([]);
  const [syncOptions, setSyncOptions] = useState<
    Pick<
      CalendarSyncRunOptions,
      "dateRange" | "fullResync" | "removeStaleEvents"
    >
  >({
    fullResync: false,
    removeStaleEvents: true,
  });

  // UI state
  const [currentStep, setCurrentStep] = useState<AppStep>("auth");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [calendarSyncCompatMode, setCalendarSyncCompatMode] = useState(false);
  const [uploadPersistenceOk, setUploadPersistenceOk] = useState(true);

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

  useEffect(() => {
    const handleCompatMode = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>;
      setCalendarSyncCompatMode(Boolean(customEvent.detail?.enabled));
    };

    window.addEventListener("calendar-sync-compat-mode", handleCompatMode);
    return () =>
      window.removeEventListener("calendar-sync-compat-mode", handleCompatMode);
  }, []);

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
    navigate("/");
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
    setUploadPersistenceOk(true);
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

        if (upload.resolvedSelectedShifts.length > 0) {
          setShifts(upload.resolvedSelectedShifts);
        }

        const shared = await detectSharedScheduleByHash(upload.fileHash);
        if (shared.isShared) {
          toast.info(
            `Upload partilhado detectado (${shared.matchingCount} correspondências consentidas).`,
          );
        }
      } catch (error) {
        setUploadPersistenceOk(false);
        toast.warning(
          `Upload persistido parcialmente: ${getErrorMessage(error)}`,
        );
        toast.warning(
          "Para evitar eliminações incorretas, a remoção automática de eventos foi desativada nesta sincronização.",
        );
      }
    }

    toast.success(
      `${processedShifts.length} turnos carregados com sucesso!${employeeName ? ` (${employeeName})` : ""}`,
    );
  };

  const resolveEffectiveUserId = () => currentUserId ?? userEmail;

  const requestSyncPreview = async (input: {
    calendarId: string;
    options: Pick<
      CalendarSyncRunOptions,
      "dateRange" | "fullResync" | "removeStaleEvents"
    >;
  }) => {
    if (!accessToken) {
      return;
    }

    const effectiveUserId = resolveEffectiveUserId();
    if (!effectiveUserId) {
      toast.error("Sessão de utilizador não encontrada");
      return;
    }

    const effectiveOptions = uploadPersistenceOk
      ? input.options
      : {
          ...input.options,
          fullResync: false,
          removeStaleEvents: false,
        };

    console.info("[CalendarSync][InputShifts][Preview]", {
      user_id: effectiveUserId,
      calendar_id: input.calendarId,
      options: effectiveOptions,
      ...summarizeShiftInput(shifts),
    });

    setPreviewLoading(true);
    try {
      const preview = await backend.calendar.previewSync(shifts, {
        userId: effectiveUserId,
        accessToken,
        calendarId: input.calendarId,
        dateRange: effectiveOptions.dateRange,
        fullResync: effectiveOptions.fullResync,
        removeStaleEvents: effectiveOptions.removeStaleEvents,
      });

      setSyncOptions(effectiveOptions);
      setSyncSummary({
        create: preview.summary.created,
        update: preview.summary.updated,
        delete: preview.summary.deleted,
        noop: preview.summary.noop,
        failed: preview.summary.failed,
      });
      setPreviewChanges(preview.changes ?? []);
    } catch (error) {
      toast.error(
        `Falha no preview de sincronização: ${getErrorMessage(error)}`,
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewConfirm = async () => {
    setShowConfirmModal(true);

    if (selectedCalendar) {
      await requestSyncPreview({
        calendarId: selectedCalendar,
        options: {
          fullResync: false,
          removeStaleEvents: uploadPersistenceOk,
        },
      });
    }
  };

  const handleSync = async (input: {
    calendarId: string;
    calendarSummary?: string;
    options: Pick<
      CalendarSyncRunOptions,
      "dateRange" | "fullResync" | "removeStaleEvents"
    >;
  }) => {
    if (!accessToken || !input.calendarId) return;

    const effectiveUserId = resolveEffectiveUserId();
    if (!effectiveUserId) {
      toast.error("Sessão de utilizador não encontrada");
      return;
    }

    const effectiveOptions = uploadPersistenceOk
      ? input.options
      : {
          ...input.options,
          fullResync: false,
          removeStaleEvents: false,
        };

    console.info("[CalendarSync][InputShifts][Apply]", {
      user_id: effectiveUserId,
      calendar_id: input.calendarId,
      options: effectiveOptions,
      ...summarizeShiftInput(shifts),
    });

    setSyncing(true);

    try {
      const result = await backend.calendar.runSync(shifts, {
        userId: effectiveUserId,
        accessToken,
        calendarId: input.calendarId,
        dateRange: effectiveOptions.dateRange,
        fullResync: effectiveOptions.fullResync,
        removeStaleEvents: effectiveOptions.removeStaleEvents,
      });

      // Update the shifts state with the googleEventIds returned from this sync.
      // This ensures subsequent re-syncs find the right events to update.
      setShifts(result.syncedShifts);

      // Update summary with actual counts from the sync engine.
      setSyncSummary({
        create: result.summary.created,
        update: result.summary.updated,
        delete: result.summary.deleted,
        noop: result.summary.noop,
        failed: result.summary.failed,
      });

      const expectedChanges = previewChanges.filter(
        (change) => change.type !== "noop",
      ).length;
      const observedChanges =
        result.summary.created +
        result.summary.updated +
        result.summary.deleted;
      if (expectedChanges > 0 && observedChanges === 0) {
        console.error(
          "SYNC ERROR: No operations detected but changes expected",
          {
            expected_changes: expectedChanges,
            preview_changes: previewChanges,
          },
        );
      }

      // Keep the last preview list visible as a post-sync change ledger.
      // If no preview happened, use execution-derived changes.
      setPreviewChanges(result.changes ?? []);

      setSelectedCalendar(input.calendarId);
      if (input.calendarSummary) {
        setCalendarName(input.calendarSummary);
      }

      setShowConfirmModal(false);
      setShowSuccessModal(true);
      toast.success("Calendário sincronizado com sucesso!");

      if (result.errors.length > 0) {
        console.warn(
          "[ShiftSync][CalendarSync] partial errors:",
          result.errors,
        );
      }
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
        {calendarSyncCompatMode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900">
            Phase 3 tracking table missing, running compatibility mode.
          </div>
        )}

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
          changes={previewChanges}
          onRequestPreview={requestSyncPreview}
          previewLoading={previewLoading}
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
          changes={previewChanges}
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
