/**
 * src/services/contracts/swaps.dto.ts
 *
 * Data-transfer objects for SwapService operations.
 */

/**
 * Input to create a new swap request.
 */
export interface CreateSwapRequestInput {
  requesterUserId: string;
  requesterShiftId: string;
  targetUserId: string;
  targetShiftId?: string;
  message?: string;
}

/**
 * A single constraint violation associated with a swap.
 */
export interface SwapViolationInput {
  code: string;
  reason: string;
}

/**
 * Validation result passed into acceptSwapRequest by the frontend.
 */
export interface AcceptSwapValidationInput {
  valid: boolean;
  violations: Array<{
    code: string;
    message: string;
  }>;
}

/**
 * Input when requesting HR-decision URLs for a swap.
 */
export interface CreateSwapHrLinksInput {
  requestId: string;
  actorUserId?: string;
  baseUrl?: string;
  expiresInHours?: number;
}

/**
 * Result of creating HR-decision links for a swap.
 */
export interface SwapHrDecisionLinksResult {
  approveUrl: string;
  declineUrl: string;
  expiresAt: string;
}

/**
 * Input when HR processes a swap decision via a one-time link.
 */
export interface ProcessSwapHrDecisionInput {
  token: string;
  action: "approve" | "decline";
  actorEmail?: string;
}

/**
 * Input when saving HR notification settings for a user.
 */
export interface SaveHRSettingsInput {
  userId: string;
  hrEmail: string;
  ccEmails: string[];
  selectedCalendarId?: string | null;
  selectedCalendarName?: string | null;
  lastSyncedCalendarId?: string | null;
}
