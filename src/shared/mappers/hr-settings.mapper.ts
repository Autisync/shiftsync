/**
 * src/shared/mappers/hr-settings.mapper.ts
 *
 * Maps Supabase DB row → HRSettings domain model.
 */

import type { Database } from "@/types/supabase";
import type { HRSettings } from "@/types/domain";

type DbHRSettingsRow = Database["public"]["Tables"]["hr_settings"]["Row"];

export function toHRSettings(row: DbHRSettingsRow): HRSettings {
  return {
    id: row.id,
    userId: row.user_id,
    hrEmail: row.hr_email,
    ccEmails: row.cc_emails ?? [],
    selectedCalendarId:
      (row as unknown as { selected_calendar_id?: string | null })
        .selected_calendar_id ?? null,
    selectedCalendarName:
      (row as unknown as { selected_calendar_name?: string | null })
        .selected_calendar_name ?? null,
    lastSyncedCalendarId:
      (row as unknown as { last_synced_calendar_id?: string | null })
        .last_synced_calendar_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
