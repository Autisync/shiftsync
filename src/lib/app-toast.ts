import { toast } from "sonner";
import type { AppErrorAlert } from "@/lib/app-error";

type AppToastLevel = "success" | "error" | "warning" | "info" | "loading";

type AppToastContent =
  | string
  | {
      title: string;
      message?: string;
    };

interface AppToastOptions {
  id?: string | number;
  dedupeKey?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const activeToastKeys = new Map<string, string | number>();

function normalizeToastContent(content: AppToastContent | AppErrorAlert): {
  title: string;
  message?: string;
} {
  if (typeof content === "string") {
    return { title: content };
  }

  return {
    title: content.title,
    message: "message" in content ? content.message : undefined,
  };
}

function rememberToastKey(key: string | undefined, toastId: string | number) {
  if (!key) return;
  activeToastKeys.set(key, toastId);
  setTimeout(() => {
    if (activeToastKeys.get(key) === toastId) {
      activeToastKeys.delete(key);
    }
  }, 4000);
}

function showToast(
  level: AppToastLevel,
  content: AppToastContent | AppErrorAlert,
  options: AppToastOptions = {},
): string | number {
  const normalized = normalizeToastContent(content);
  const existingId = options.dedupeKey
    ? activeToastKeys.get(options.dedupeKey)
    : undefined;
  const id = options.id ?? existingId;

  const toastId = toast[level](normalized.title, {
    id,
    description: normalized.message,
    duration: options.duration,
    action: options.action
      ? {
          label: options.action.label,
          onClick: options.action.onClick,
        }
      : undefined,
  });

  rememberToastKey(options.dedupeKey, toastId);
  return toastId;
}

export const appToast = {
  success(content: AppToastContent, options?: AppToastOptions) {
    return showToast("success", content, options);
  },
  error(content: AppToastContent | AppErrorAlert, options?: AppToastOptions) {
    return showToast("error", content, options);
  },
  warning(content: AppToastContent | AppErrorAlert, options?: AppToastOptions) {
    return showToast("warning", content, options);
  },
  info(content: AppToastContent | AppErrorAlert, options?: AppToastOptions) {
    return showToast("info", content, options);
  },
  loading(content: AppToastContent, options?: AppToastOptions) {
    return showToast("loading", content, options);
  },
  dismiss(id?: string | number) {
    toast.dismiss(id);
  },
};
