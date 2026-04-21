/**
 * src/services/contracts/common.dto.ts
 *
 * Shared primitive DTOs used across multiple service contracts.
 * Re-exports pagination types from domain so callers import from one place.
 */

export type { PaginatedQuery, PaginatedResult } from "@/types/domain";

/**
 * A file attachment descriptor used when submitting leave requests.
 * Storage paths are resolved during submission; browser callers may provide the
 * original File so provider implementations can upload it before sending.
 */
export interface FileAttachmentInput {
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  file?: File | null;
}

/**
 * Attachment metadata returned in email previews or confirmations.
 * storagePath is omitted — it is private to server implementations.
 */
export interface FileAttachmentInfo {
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
}

/**
 * Standard email compose payload returned by preview methods and
 * consumed by compose-link generators and confirmation flows.
 */
export interface EmailPreviewPayload {
  subject: string;
  to: string[];
  cc: string[];
  body: string;
  attachments: FileAttachmentInfo[];
}
