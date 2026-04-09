/**
 * src/services/backend/supabase-provider.ts
 *
 * BackendServices implementation backed by Supabase.
 * All raw Supabase queries live here; no imports of supabase-client
 * should be needed in UI components once this provider is wired.
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";
import type {
  BackendServices,
  AuthService,
  UserService,
  ShiftService,
  UploadService,
  SwapService,
  LeaveService,
  CalendarSyncService,
  NotificationService,
} from "./types";
import type {
  AuthSession,
  UserProfile,
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  LeaveRequest,
  LeaveRequestStatus,
  ScheduleUpload,
  ScheduleAccessRequest,
} from "@/types/domain";
import { toUserProfile } from "@/shared/mappers/user.mapper";
import { toShift } from "@/shared/mappers/shift.mapper";
import {
  toSwapAvailability,
  toSwapRequest,
} from "@/shared/mappers/swap.mapper";
import { toLeaveRequest } from "@/shared/mappers/leave.mapper";
import {
  toScheduleUpload,
  toScheduleAccessRequest,
} from "@/shared/mappers/upload.mapper";
import { GoogleCalendarService } from "@/lib/google-calendar";

// Helper: throw on Supabase error
function assertNoError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

function getHomeRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}home`;
}

// ── AuthService ────────────────────────────────────────────────────────────

const supabaseAuth: AuthService = {
  async getSession(): Promise<AuthSession | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;
    return {
      userId: data.session.user.id,
      email: data.session.user.email ?? "",
      providerToken: data.session.provider_token ?? null,
    };
  },

  async signInWithGoogle(): Promise<string> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        skipBrowserRedirect: true,
        redirectTo: getHomeRedirectUrl(),
        queryParams: { access_type: "offline", prompt: "consent" },
        scopes: "openid email profile https://www.googleapis.com/auth/calendar",
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth redirect URL returned");
    return data.url;
  },

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthChange(callback: (session: AuthSession | null) => void): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!session?.user) {
          callback(null);
          return;
        }
        callback({
          userId: session.user.id,
          email: session.user.email ?? "",
          providerToken: session.provider_token ?? null,
        });
      },
    );
    return () => subscription.unsubscribe();
  },
};

// ── UserService ────────────────────────────────────────────────────────────

const supabaseUsers: UserService = {
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return toUserProfile(data);
  },

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, "fullName" | "email" | "employeeCode">>,
  ): Promise<UserProfile> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("users")
      .update({
        ...(updates.fullName !== undefined && {
          full_name: updates.fullName,
        }),
        ...(updates.employeeCode !== undefined && {
          employee_code: updates.employeeCode,
        }),
        ...(updates.email !== undefined && { email: updates.email }),
      })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return toUserProfile(data);
  },
};

// ── ShiftService ───────────────────────────────────────────────────────────

const supabaseShifts: ShiftService = {
  async getShiftsForUser(userId: string): Promise<Shift[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toShift);
  },

  async getShiftById(id: string): Promise<Shift | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return toShift(data);
  },

  async createShift(
    shift: Omit<Shift, "id" | "createdAt" | "updatedAt">,
  ): Promise<Shift> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("shifts")
      .insert({
        user_id: shift.userId,
        date: shift.date,
        starts_at: shift.startsAt,
        ends_at: shift.endsAt,
        role: shift.role,
        location: shift.location,
        google_event_id: shift.googleEventId,
        source_upload_id: shift.sourceUploadId,
      })
      .select()
      .single();
    return toShift(assertNoError({ data, error }));
  },

  async updateShift(
    id: string,
    updates: Partial<Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">>,
  ): Promise<Shift> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("shifts")
      .update({
        ...(updates.date !== undefined && { date: updates.date }),
        ...(updates.startsAt !== undefined && {
          starts_at: updates.startsAt,
        }),
        ...(updates.endsAt !== undefined && { ends_at: updates.endsAt }),
        ...(updates.role !== undefined && { role: updates.role }),
        ...(updates.location !== undefined && {
          location: updates.location,
        }),
        ...(updates.googleEventId !== undefined && {
          google_event_id: updates.googleEventId,
        }),
      })
      .eq("id", id)
      .select()
      .single();
    return toShift(assertNoError({ data, error }));
  },

  async deleteShift(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) throw error;
  },

  async updateGoogleEventId(
    shiftId: string,
    googleEventId: string,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase
      .from("shifts")
      .update({ google_event_id: googleEventId })
      .eq("id", shiftId);
    if (error) throw error;
  },
};

// ── UploadService ──────────────────────────────────────────────────────────

const supabaseUploads: UploadService = {
  async createUpload(
    data: Omit<ScheduleUpload, "id" | "uploadedAt">,
  ): Promise<ScheduleUpload> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data: row, error } = await supabase
      .from("schedule_uploads")
      .insert({
        uploader_user_id: data.uploaderUserId,
        file_hash: data.fileHash,
        consent_to_share: data.consentToShare,
        metadata: data.metadata,
      })
      .select()
      .single();
    return toScheduleUpload(assertNoError({ data: row, error }));
  },

  async getUploadById(id: string): Promise<ScheduleUpload | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("schedule_uploads")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return toScheduleUpload(data);
  },

  async getUploadsByUser(userId: string): Promise<ScheduleUpload[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("schedule_uploads")
      .select("*")
      .eq("uploader_user_id", userId)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toScheduleUpload);
  },

  async getAccessRequestsForUpload(
    uploadId: string,
  ): Promise<ScheduleAccessRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("schedule_access_requests")
      .select("*")
      .eq("schedule_upload_id", uploadId);
    if (error) throw error;
    return (data ?? []).map(toScheduleAccessRequest);
  },

  async createAccessRequest(
    data: Omit<ScheduleAccessRequest, "id" | "createdAt" | "updatedAt">,
  ): Promise<ScheduleAccessRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data: row, error } = await supabase
      .from("schedule_access_requests")
      .insert({
        requester_user_id: data.requesterUserId,
        schedule_upload_id: data.scheduleUploadId,
        consent_given: data.consentGiven,
        status: data.status,
        reviewed_at: data.reviewedAt,
        reviewed_by_user_id: data.reviewedByUserId,
      })
      .select()
      .single();
    return toScheduleAccessRequest(assertNoError({ data: row, error }));
  },

  async updateAccessRequest(
    id: string,
    updates: Partial<
      Pick<
        ScheduleAccessRequest,
        "consentGiven" | "status" | "reviewedAt" | "reviewedByUserId"
      >
    >,
  ): Promise<ScheduleAccessRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("schedule_access_requests")
      .update({
        ...(updates.consentGiven !== undefined && {
          consent_given: updates.consentGiven,
        }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.reviewedAt !== undefined && {
          reviewed_at: updates.reviewedAt,
        }),
        ...(updates.reviewedByUserId !== undefined && {
          reviewed_by_user_id: updates.reviewedByUserId,
        }),
      })
      .eq("id", id)
      .select()
      .single();
    return toScheduleAccessRequest(assertNoError({ data, error }));
  },
};

// ── SwapService ────────────────────────────────────────────────────────────

const supabaseSwaps: SwapService = {
  async openAvailability(
    shiftId: string,
    userId: string,
  ): Promise<SwapAvailability> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_availability")
      .insert({
        shift_id: shiftId,
        opened_by_user_id: userId,
        is_open: true,
      })
      .select()
      .single();
    return toSwapAvailability(assertNoError({ data, error }));
  },

  async closeAvailability(shiftId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase
      .from("swap_availability")
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq("shift_id", shiftId);
    if (error) throw error;
  },

  async getOpenAvailabilities(): Promise<
    Array<{ shift: Shift; availability: SwapAvailability }>
  > {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("swap_availability")
      .select("*, shifts(*)")
      .eq("is_open", true);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      availability: toSwapAvailability(row),
      shift: toShift(row.shifts as Parameters<typeof toShift>[0]),
    }));
  },

  async createSwapRequest(input: {
    requesterUserId: string;
    requesterShiftId: string;
    targetUserId: string;
    targetShiftId?: string;
    message?: string;
  }): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_requests")
      .insert({
        requester_user_id: input.requesterUserId,
        requester_shift_id: input.requesterShiftId,
        target_user_id: input.targetUserId,
        target_shift_id: input.targetShiftId ?? null,
        message: input.message ?? null,
        status: "pending",
      })
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },

  async getSwapRequestsForUser(userId: string): Promise<SwapRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("swap_requests")
      .select("*")
      .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSwapRequest);
  },

  async updateSwapStatus(
    id: string,
    status: SwapRequestStatus,
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },
};

// ── LeaveService ───────────────────────────────────────────────────────────

const supabaseLeave: LeaveService = {
  async createLeaveRequest(
    input: Omit<LeaveRequest, "id" | "status" | "createdAt" | "updatedAt">,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .insert({
        user_id: input.userId,
        start_date: input.startDate,
        end_date: input.endDate,
        type: input.type,
        notes: input.notes,
        status: "pending",
      })
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLeaveRequest);
  },

  async updateLeaveStatus(
    id: string,
    status: LeaveRequestStatus,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },
};

// ── CalendarSyncService ────────────────────────────────────────────────────

const supabaseCalendar: CalendarSyncService = {
  async syncShifts(
    shifts: Shift[],
    accessToken: string,
    calendarId: string,
  ): Promise<{ created: number; updated: number; deleted: number }> {
    const service = new GoogleCalendarService(accessToken);
    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const shift of shifts) {
      const shiftData = {
        id: shift.id,
        week: 0,
        date: new Date(shift.date),
        startTime: shift.startsAt,
        endTime: shift.endsAt,
        shiftType: "other" as const,
        status: "active" as const,
        googleEventId: shift.googleEventId ?? undefined,
      };

      if (!shift.googleEventId) {
        await service.createEvent(calendarId, shiftData);
        created++;
      } else {
        await service.updateEvent(calendarId, shift.googleEventId, shiftData);
        updated++;
      }
    }

    return { created, updated, deleted };
  },
};

// ── NotificationService ────────────────────────────────────────────────────

const supabaseNotifications: NotificationService = {
  async notifyHR(_subject: string, _body: string): Promise<void> {
    // Stub: will be wired to Supabase Edge Function or email trigger in Phase 7.
    console.info("[NotificationService] notifyHR called (stub)");
  },
};

// ── Export full provider ───────────────────────────────────────────────────

export class SupabaseProvider implements BackendServices {
  auth = supabaseAuth;
  users = supabaseUsers;
  shifts = supabaseShifts;
  uploads = supabaseUploads;
  swaps = supabaseSwaps;
  leave = supabaseLeave;
  calendar = supabaseCalendar;
  notifications = supabaseNotifications;
}
