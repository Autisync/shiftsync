/**
 * src/services/contracts/uploads.dto.ts
 *
 * Data-transfer objects for UploadService operations.
 */

import type { ScheduleUpload, ScheduleAccessRequest } from "@/types/domain";

/**
 * Input to create a new schedule upload record.
 */
export type CreateUploadInput = Omit<ScheduleUpload, "id" | "uploadedAt">;

/**
 * Input when initiating a full upload-to-calendar sync.
 */
export interface StartUploadSyncInput {
  userId: string;
  uploadId: string;
  acknowledgeRisk: boolean;
  acknowledgedAt?: string;
  acknowledgedByUserId?: string;
  calendarId: string;
  accessToken: string;
}

/**
 * Input to create an access request for a shared schedule.
 */
export type CreateAccessRequestInput = Omit<
  ScheduleAccessRequest,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * Mutable fields on an access request.
 */
export type UpdateAccessRequestInput = Partial<
  Pick<
    ScheduleAccessRequest,
    "consentGiven" | "status" | "reviewedAt" | "reviewedByUserId"
  >
>;
