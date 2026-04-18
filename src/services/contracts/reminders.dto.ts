/**
 * src/services/contracts/reminders.dto.ts
 *
 * Data-transfer objects for ReminderService operations.
 */

export interface CreateReminderInput {
  userId: string;
  type: "days_off_selection";
  triggerAt: string;
  payload?: Record<string, unknown>;
}
