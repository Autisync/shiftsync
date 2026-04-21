import { getDebugErrorMessage, toUserFacingError } from "@/lib/app-error";

export function getErrorMessage(err: unknown): string {
  return toUserFacingError(err);
}

export { getDebugErrorMessage };
