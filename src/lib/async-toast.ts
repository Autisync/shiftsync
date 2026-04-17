import { toast } from "sonner";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface AsyncToastMessages<T> {
  loading: string;
  success: string | ((result: T) => string);
  error?: string | ((error: unknown) => string);
}

function resolveMessage<T>(
  message: string | ((value: T) => string),
  value: T,
): string {
  return typeof message === "function" ? message(value) : message;
}

export async function runWithToast<T>(
  action: () => Promise<T>,
  messages: AsyncToastMessages<T>,
): Promise<T> {
  const toastId = toast.loading(messages.loading);

  try {
    const result = await action();
    toast.success(resolveMessage(messages.success, result), { id: toastId });
    return result;
  } catch (error) {
    const fallbackMessage = getErrorMessage(error);
    const errorMessage = messages.error
      ? resolveMessage(messages.error, error)
      : fallbackMessage;

    toast.error(errorMessage, { id: toastId });
    throw error;
  }
}
