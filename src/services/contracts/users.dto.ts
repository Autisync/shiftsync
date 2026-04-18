/**
 * src/services/contracts/users.dto.ts
 *
 * Data-transfer objects for UserService operations.
 */

/**
 * Stored calendar preference for a user (selected calendar for shift sync).
 */
export interface CalendarPreferenceDTO {
  calendarId: string;
  calendarName: string | null;
}

/**
 * Input when persisting a user's default calendar preference.
 */
export interface SaveCalendarPreferenceInput {
  calendarId: string;
  calendarName?: string | null;
}

/**
 * Fields that may be updated on a user profile.
 */
export interface UpdateUserProfileInput {
  fullName?: string | null;
  email?: string | null;
  employeeCode?: string | null;
}
