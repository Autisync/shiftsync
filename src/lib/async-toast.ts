import { normalizeAppError } from "@/lib/app-error";
import { appToast } from "@/lib/app-toast";

interface AsyncToastMessages<T> {
  loading: string;
  success: string | ((result: T) => string);
  error?: string | ((error: unknown) => string);
  dedupeKey?: string;
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
  const toastId = appToast.loading(messages.loading, {
    dedupeKey: messages.dedupeKey,
  });

  try {
    const result = await action();
    appToast.success(resolveMessage(messages.success, result), {
      id: toastId,
      dedupeKey: messages.dedupeKey,
    });
    return result;
  } catch (error) {
    const fallbackMessage = normalizeAppError(error).message;
    const errorMessage = messages.error
      ? resolveMessage(messages.error, error)
      : fallbackMessage;

    appToast.error(
      {
        title: "Ação não concluída",
        message: errorMessage,
      },
      {
        id: toastId,
        dedupeKey: messages.dedupeKey,
      },
    );
    throw error;
  }
}
