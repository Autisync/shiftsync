import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { AuthCard } from "@/components/auth/auth-card";
import { FirstLoginProfileDialog } from "@/components/auth/FirstLoginProfileDialog";
import { ProfileSettingsDialog } from "@/components/auth/ProfileSettingsDialog";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { CalendarSelector } from "@/components/calendar/calendar-selector";
import { FileUploadZone } from "@/components/upload/file-upload-zone";
import { ShiftPreviewTable } from "@/components/shifts/shift-preview-table";
import { SyncConfirmationModal } from "@/components/sync/sync-confirmation-modal";
import { SuccessModal } from "@/components/sync/success-modal";
import { ShiftData, SyncSummary, ParsedScheduleResult } from "@/types/shift";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { getBackend } from "@/services/backend/backend-provider";
import { getConfig } from "@/config/env";
import type { CalendarSyncRunOptions } from "@/services/backend/types";
import { toast } from "sonner";
import Footer from "../components/Footer";
import {
  persistUploadMetadata,
  detectSharedScheduleByHash,
} from "@/features/uploads/services/schedule-upload.service";
import { isSwapsEnabled, isLeaveEnabled } from "@/shared/utils/featureFlags";
import { SwapAvailabilityPanel } from "@/components/swaps/swap-availability-panel";
import { SwapsCalendarScreen } from "@/components/swaps/swaps-calendar-screen";
import { LeaveScreen } from "@/components/leave/leave-screen";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { SwapHRActionPage } from "@/components/swaps/swap-hr-action-page";
import { LeaveHRActionPage } from "@/components/leave/leave-hr-action-page";
import { ScheduleSharePage } from "@/components/upload/schedule-share-page";
import { LoadingState } from "@/components/ui/loading-state";

import { useConsent } from "@/lib/cookies/ConsentContext";
import { SpeedInsights } from "@vercel/speed-insights/react";
import type { CalendarSyncPreviewChange } from "@/features/calendar/types";
import { validateScheduleConstraints } from "@/features/swaps/services/swap-constraints";
import { runWithToast } from "@/lib/async-toast";
import {
  authFailureMessage,
  feedbackMessages,
  googleLoginFailureMessage,
  profileLoadFailureMessage,
  supabaseLoginFailureMessage,
  supabaseLogoutFailureMessage,
  syncPreviewFailureMessage,
  uploadPartialFailureMessage,
} from "@/lib/feedback-messages";

const STORAGE_KEYS = {
  ACCESS_TOKEN: "google_access_token",
  USER_EMAIL: "google_user_email",
  DEFAULT_CALENDAR_ID: "default_calendar_id",
  DEFAULT_CALENDAR_NAME: "default_calendar_name",
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
  const rows = shifts
    .filter(
      (shift) =>
        shift.date instanceof Date && !Number.isNaN(shift.date.getTime()),
    )
    .map((shift) => ({
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

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoDateTime(date: Date, time: string): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  const value = new Date(date);
  value.setHours(Number(hours), Number(minutes), 0, 0);
  return value;
}

function buildConstraintInputFromShifts(shifts: ShiftData[]) {
  return shifts
    .filter(
      (shift) =>
        shift.date instanceof Date &&
        !Number.isNaN(shift.date.getTime()) &&
        Boolean(shift.startTime) &&
        Boolean(shift.endTime),
    )
    .map((shift) => {
      const startsAt = toIsoDateTime(shift.date, shift.startTime);
      const endsAt = toIsoDateTime(shift.date, shift.endTime);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        return null;
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        endsAt.setDate(endsAt.getDate() + 1);
      }

      return {
        date: toIsoDate(shift.date),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
    })
    .filter(
      (item): item is { date: string; startsAt: string; endsAt: string } =>
        Boolean(item),
    );
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

function normalizeDisplayName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function Home() {
  const { hasCategory } = useConsent();
  const navigate = useNavigate();
  const location = useLocation();
  const backend = getBackend();
  const swapsEnabled = isSwapsEnabled();
  const leaveEnabled = isLeaveEnabled();
  const isSwapsRoute = location.pathname.endsWith("/swaps");
  const isLeaveRoute = location.pathname.endsWith("/leave");
  const isNotificationsRoute = location.pathname.endsWith("/notifications");
  const isSwapHRActionRoute = location.pathname.includes("/swaps/action");
  const isLeaveHRActionRoute = location.pathname.includes("/leave/action");
  const isScheduleHistoryRoute =
    location.pathname.endsWith("/schedule-history") ||
    location.pathname.endsWith("/schedule-share");
  // Authentication state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userDisplayName, setUserDisplayName] = useState<string>("");
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
  const [settingsInitialHrEmail, setSettingsInitialHrEmail] =
    useState<string>("");
  const [settingsInitialCcEmails, setSettingsInitialCcEmails] = useState<
    string[]
  >([]);
  const [settingsLastUpdatedAt, setSettingsLastUpdatedAt] = useState<
    string | null
  >(null);

  // Calendar state
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [calendarName, setCalendarName] = useState<string>("");

  const saveDefaultCalendarPreference = async (
    calendarId: string,
    name?: string,
  ) => {
    if (!currentUserId) return;

    try {
      await backend.users.saveDefaultCalendarPreference(currentUserId, {
        calendarId,
        calendarName: name ?? null,
      });
    } catch (error) {
      console.warn(
        "[ShiftSync] Could not persist default calendar preference:",
        error,
      );
    }
  };

  const loadDefaultCalendarPreference = async (userId: string) => {
    try {
      const preference =
        await backend.users.getDefaultCalendarPreference(userId);
      if (!preference?.calendarId) return;

      setSelectedCalendar(preference.calendarId);
      localStorage.setItem(
        STORAGE_KEYS.DEFAULT_CALENDAR_ID,
        preference.calendarId,
      );

      const resolvedName = preference.calendarName ?? "O Meu Calendário";
      setCalendarName(resolvedName);
      localStorage.setItem(STORAGE_KEYS.DEFAULT_CALENDAR_NAME, resolvedName);
    } catch (error) {
      console.warn(
        "[ShiftSync] Could not load default calendar preference:",
        error,
      );
    }
  };

  useEffect(() => {
    const savedCalendarId = localStorage.getItem(
      STORAGE_KEYS.DEFAULT_CALENDAR_ID,
    );
    const savedCalendarName = localStorage.getItem(
      STORAGE_KEYS.DEFAULT_CALENDAR_NAME,
    );

    if (savedCalendarId) {
      setSelectedCalendar(savedCalendarId);
    }
    if (savedCalendarName) {
      setCalendarName(savedCalendarName);
    }
  }, []);

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
  const [uploadWorkflowStatus, setUploadWorkflowStatus] = useState<
    string | null
  >(null);
  const syncConstraintWarnings = useMemo(
    () =>
      validateScheduleConstraints(buildConstraintInputFromShifts(shifts))
        .violations,
    [shifts],
  );
  const headerDisplayName = userDisplayName || userEmail;

  const loadUserProfile = async (userId: string) => {
    try {
      const profile = await withTimeout(
        backend.users.getUserProfile(userId),
        SESSION_RESTORE_TIMEOUT_MS,
      );

      setUserDisplayName(normalizeDisplayName(profile?.fullName));
      setProfileInitialName(profile?.fullName ?? "");
      setProfileInitialCode(profile?.employeeCode ?? "");

      if (mustShowProfileDialog(userId, profile)) {
        setProfileInitialName(profile?.fullName ?? "");
        setProfileInitialCode(profile?.employeeCode ?? "");
        setProfileDialogOpen(true);
      }
    } catch (error) {
      console.warn("[ShiftSync] Profile bootstrap skipped:", error);
    }
  };

  const loadHrSettings = async (userId: string) => {
    try {
      const settings = await withTimeout(
        backend.swaps.getHRSettings(userId),
        SESSION_RESTORE_TIMEOUT_MS,
      );

      setSettingsInitialHrEmail(settings?.hrEmail ?? "");
      setSettingsInitialCcEmails(settings?.ccEmails ?? []);
    } catch (error) {
      console.warn("[ShiftSync] HR settings bootstrap skipped:", error);
      setSettingsInitialHrEmail("");
      setSettingsInitialCcEmails([]);
    }
  };

  // Restore session from Supabase (preferred) or localStorage fallback on mount.
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        if (getConfig().backendMode === "supabase") {
          const session = await withTimeout(
            backend.auth.getSession(),
            SESSION_RESTORE_TIMEOUT_MS,
          );

          if (session) {
            const providerAccessToken = session.providerToken;
            const email = session.email;
            const userId = session.userId;

            setAccessToken(providerAccessToken);
            setUserEmail(email);
            setCurrentUserId(userId);
            setCurrentStep("upload");

            void loadUserProfile(userId);
            void loadHrSettings(userId);
            void loadDefaultCalendarPreference(userId);

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
    if (getConfig().backendMode !== "supabase") {
      return;
    }

    return backend.auth.onAuthChange(async (session) => {
      if (!session) {
        return;
      }

      setUserEmail(session.email);
      setAccessToken(session.providerToken);
      setCurrentUserId(session.userId);
      setCurrentStep("upload");

      void loadUserProfile(session.userId);
      void loadHrSettings(session.userId);
      void loadDefaultCalendarPreference(session.userId);
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
        toast.error(feedbackMessages.sessionExpired);
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
    setUserDisplayName("");
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
        toast.success(feedbackMessages.authenticationSuccess);
      } catch (err) {
        setAuthLoading(false);
        toast.error(authFailureMessage(err));
      }
    },
    onError: (error) => {
      setAuthLoading(false);
      toast.error(googleLoginFailureMessage(error));
    },
    scope: "openid email profile https://www.googleapis.com/auth/calendar",
  });

  const handleSignIn = async (gdprConsent: boolean) => {
    if (!gdprConsent) return;

    setAuthLoading(true);

    if (getConfig().backendMode === "supabase") {
      try {
        const oauthUrl = await backend.auth.signInWithGoogle();
        window.location.assign(oauthUrl);
      } catch (error) {
        setAuthLoading(false);
        toast.error(supabaseLoginFailureMessage(error));
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
    setUploadWorkflowStatus("Upload recebido. A processar importação...");

    if (context && currentUserId) {
      try {
        const upload = await runWithToast(
          () =>
            persistUploadMetadata({
              userId: currentUserId,
              file: context.sourceFile,
              consentToShare: context.consentToShare,
              parsedResult: context.parsedResult,
              selectedEmployeeName: employeeName,
              selectedEmployeeShifts: processedShifts,
            }),
          {
            loading: "A importar horário...",
            success: () =>
              `${processedShifts.length} turnos carregados com sucesso!${employeeName ? ` (${employeeName})` : ""}`,
            error: uploadPartialFailureMessage,
          },
        );

        if (upload.resolvedSelectedShifts.length > 0) {
          setShifts(upload.resolvedSelectedShifts);
        }

        setUploadWorkflowStatus(
          "Importação concluída. Estado interno de turnos atualizado. A preparar calendário de trocas...",
        );

        const shared = await detectSharedScheduleByHash(upload.fileHash);
        if (shared.isShared) {
          toast.info(
            `Upload partilhado detectado (${shared.matchingCount} correspondências consentidas).`,
          );
        }

        setUploadWorkflowStatus(
          "Upload sincronizado internamente. Pode abrir o calendário de trocas quando quiser.",
        );
      } catch (error) {
        setUploadPersistenceOk(false);
        setUploadWorkflowStatus(
          `Importação parcial: ${getErrorMessage(error)}.`,
        );
        toast.warning(feedbackMessages.uploadSafetyFallback);
        return;
      }
    }

    if (!context || !currentUserId) {
      toast.success(
        `${processedShifts.length} turnos carregados com sucesso!${employeeName ? ` (${employeeName})` : ""}`,
      );
    }
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
      toast.error(feedbackMessages.missingUserSession);
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
      toast.error(syncPreviewFailureMessage(error));
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
      toast.error(feedbackMessages.missingUserSession);
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
      const result = await runWithToast(
        () =>
          backend.calendar.runSync(shifts, {
            userId: effectiveUserId,
            accessToken,
            calendarId: input.calendarId,
            dateRange: effectiveOptions.dateRange,
            fullResync: effectiveOptions.fullResync,
            removeStaleEvents: effectiveOptions.removeStaleEvents,
          }),
        {
          loading: "A sincronizar calendário...",
          success: "Calendário sincronizado com sucesso!",
          error: (error) =>
            `Falha ao sincronizar calendário: ${getErrorMessage(error)}`,
        },
      );

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

      if (result.errors.length > 0) {
        console.warn(
          "[ShiftSync][CalendarSync] partial errors:",
          result.errors,
        );
      }
    } catch {
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
    if (getConfig().backendMode === "supabase") {
      try {
        await backend.auth.signOut();
      } catch (error) {
        toast.error(supabaseLogoutFailureMessage(error));
      }
    }

    clearSession();
    setSelectedCalendar(null);
    setShifts([]);
    toast.info(feedbackMessages.sessionLogoutSuccess);
  };

  const handleTokenExpired = () => {
    clearSession();
    toast.error(feedbackMessages.sessionExpired);
  };

  const handleOpenSettings = async () => {
    if (!currentUserId) {
      toast.error(feedbackMessages.missingUserSession);
      return;
    }

    try {
      const profile = await backend.users.getUserProfile(currentUserId);
      const hrSettings = await backend.swaps.getHRSettings(currentUserId);
      setUserDisplayName(normalizeDisplayName(profile?.fullName));
      setSettingsInitialName(profile?.fullName ?? "");
      setSettingsInitialCode(profile?.employeeCode ?? "");
      setSettingsInitialEmail(profile?.email ?? userEmail);
      setSettingsInitialHrEmail(hrSettings?.hrEmail ?? "");
      setSettingsInitialCcEmails(hrSettings?.ccEmails ?? []);
      setSelectedCalendar(
        localStorage.getItem(STORAGE_KEYS.DEFAULT_CALENDAR_ID) ??
          selectedCalendar,
      );
      setSettingsLastUpdatedAt(profile?.updatedAt ?? null);
      setSettingsDialogOpen(true);
    } catch (error) {
      toast.error(profileLoadFailureMessage(error));
    }
  };

  // Show loading while restoring session
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <LoadingState message="A restaurar sessão..." />
      </div>
    );
  }

  // HR decision link — standalone page, no dashboard chrome
  if (isSwapHRActionRoute) {
    return <SwapHRActionPage service={backend.swaps} />;
  }

  if (isLeaveHRActionRoute) {
    return <LeaveHRActionPage service={backend.leave} />;
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
          displayName={headerDisplayName}
          onLogout={handleLogout}
          onOpenSettings={handleOpenSettings}
          onOpenSwaps={() => navigate("/home/swaps")}
          onOpenLeave={() => navigate("/home/leave")}
          onOpenHistory={() => navigate("/home/schedule-share")}
          onOpenDashboard={() => navigate("/home")}
          activeSection={
            isSwapsRoute
              ? "swaps"
              : isLeaveRoute
                ? "leave"
                : isScheduleHistoryRoute
                  ? "history"
                  : isNotificationsRoute
                    ? "notifications"
                    : "home"
          }
          leaveEnabled={leaveEnabled}
          userId={currentUserId ?? undefined}
          notificationService={backend.notifications}
          onOpenNotifications={() => navigate("/home/notifications")}
        />

        {uploadWorkflowStatus && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs sm:text-sm text-blue-900">
            {uploadWorkflowStatus}
          </div>
        )}

        {isSwapsRoute && currentUserId ? (
          <SwapsCalendarScreen
            userId={currentUserId}
            enabled={swapsEnabled}
            accessToken={accessToken}
            calendarId={selectedCalendar}
            onOpenSettings={handleOpenSettings}
          />
        ) : null}

        {isLeaveRoute && currentUserId ? (
          <LeaveScreen
            userId={currentUserId}
            backend={backend}
            hrEmail={settingsInitialHrEmail}
            ccEmails={settingsInitialCcEmails}
            employeeName={settingsInitialName || profileInitialName}
            employeeCode={settingsInitialCode || profileInitialCode}
            accessToken={accessToken}
            defaultCalendarId={selectedCalendar}
          />
        ) : null}

        {isNotificationsRoute && currentUserId ? (
          <NotificationsPage
            userId={currentUserId}
            service={backend.notifications}
          />
        ) : null}

        {isScheduleHistoryRoute && currentUserId ? (
          <ScheduleSharePage
            userId={currentUserId}
            service={backend.uploads}
            accessToken={accessToken ?? undefined}
            defaultCalendarId={selectedCalendar}
          />
        ) : null}

        {!isSwapsRoute &&
        !isLeaveRoute &&
        !isNotificationsRoute &&
        !isScheduleHistoryRoute ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-1 space-y-4 sm:space-y-6">
              <CalendarSelector
                accessToken={accessToken || ""}
                selectedCalendar={selectedCalendar}
                onSelectCalendar={(id, name) => {
                  setSelectedCalendar(id);
                  setCalendarName(name || "O Meu Calendário");
                  localStorage.setItem(STORAGE_KEYS.DEFAULT_CALENDAR_ID, id);
                  localStorage.setItem(
                    STORAGE_KEYS.DEFAULT_CALENDAR_NAME,
                    name || "O Meu Calendário",
                  );
                  void saveDefaultCalendarPreference(
                    id,
                    name || "O Meu Calendário",
                  );
                }}
                onTokenExpired={handleTokenExpired}
              />

              {(currentStep === "upload" || currentStep === "preview") && (
                <FileUploadZone
                  onFileProcessed={handleFileProcessed}
                  disabled={false}
                />
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

              {currentUserId && <div id="swaps-panel" />}
            </div>
          </div>
        ) : null}

        {/* Modals */}
        <SyncConfirmationModal
          open={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleSync}
          summary={syncSummary}
          changes={previewChanges}
          constraintWarnings={syncConstraintWarnings}
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
            setUserDisplayName(fullName.trim());
            setUserEmail(email);
            setProfileDialogOpen(false);
            toast.success(feedbackMessages.profileUpdated);
          }}
        />

        <ProfileSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          initialEmail={settingsInitialEmail}
          initialFullName={settingsInitialName}
          initialEmployeeCode={settingsInitialCode}
          initialHrEmail={settingsInitialHrEmail}
          initialCcEmails={settingsInitialCcEmails}
          accessToken={accessToken}
          initialDefaultCalendarId={selectedCalendar}
          initialDefaultCalendarName={calendarName}
          lastUpdatedAt={settingsLastUpdatedAt}
          onSave={async ({
            fullName,
            employeeCode,
            email,
            hrEmail,
            ccEmails,
            defaultCalendarId,
            defaultCalendarName,
          }) => {
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
            setUserDisplayName(fullName.trim());
            setSettingsInitialName(fullName);
            setSettingsInitialCode(employeeCode);
            setSettingsInitialEmail(email);
            setSettingsLastUpdatedAt(updatedProfile.updatedAt);
            setProfileInitialName(fullName);
            setProfileInitialCode(employeeCode);

            if (hrEmail.trim()) {
              await backend.swaps.saveHRSettings({
                userId: currentUserId,
                hrEmail: hrEmail.trim(),
                ccEmails,
                selectedCalendarId: defaultCalendarId,
                selectedCalendarName: defaultCalendarName,
              });
            }

            setSettingsInitialHrEmail(hrEmail.trim());
            setSettingsInitialCcEmails(ccEmails);

            if (defaultCalendarId) {
              setSelectedCalendar(defaultCalendarId);
              localStorage.setItem(
                STORAGE_KEYS.DEFAULT_CALENDAR_ID,
                defaultCalendarId,
              );
              void saveDefaultCalendarPreference(
                defaultCalendarId,
                defaultCalendarName || "O Meu Calendário",
              );
            }

            if (defaultCalendarName) {
              setCalendarName(defaultCalendarName);
              localStorage.setItem(
                STORAGE_KEYS.DEFAULT_CALENDAR_NAME,
                defaultCalendarName,
              );
            }

            setSettingsDialogOpen(false);
            toast.success(feedbackMessages.profileUpdatedInSettings);
          }}
        />
      </div>
      <SpeedInsights />
      <Footer />
    </div>
  );
}

export default Home;
