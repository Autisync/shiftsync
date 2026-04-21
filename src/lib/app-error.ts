export type AppErrorCategory =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "missing_data"
  | "duplicate"
  | "file_upload"
  | "calendar_sync"
  | "notification"
  | "offline"
  | "server"
  | "unknown";

export type AppErrorSeverity = "info" | "warning" | "error";

export interface AppErrorAlert {
  title: string;
  message: string;
  severity: AppErrorSeverity;
  actionLabel?: string;
}

export interface NormalizedAppError extends AppErrorAlert {
  category: AppErrorCategory;
  debugMessage: string;
  isRetryable: boolean;
}

interface AppErrorOptions {
  context?:
    | "auth"
    | "profile"
    | "schedule"
    | "upload"
    | "leave"
    | "swap"
    | "calendar"
    | "notification"
    | "session"
    | "generic";
  fallbackMessage?: string;
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const maybe = error as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      status?: unknown;
      statusText?: unknown;
    };

    const fragments = [
      maybe.message,
      maybe.error,
      maybe.details,
      maybe.hint,
      maybe.code,
      maybe.status,
      maybe.statusText,
    ]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (fragments.length > 0) {
      return fragments.join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unexpected error object";
    }
  }

  return "Unexpected unknown error";
}

function detectCategory(
  message: string,
  options: AppErrorOptions,
): AppErrorCategory {
  const normalized = message.toLowerCase();

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("abort")
  ) {
    return "timeout";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("fetcherror") ||
    normalized.includes("load failed")
  ) {
    return "network";
  }

  if (
    normalized.includes("jwt") ||
    normalized.includes("expired") ||
    normalized.includes("session") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid login") ||
    normalized.includes("auth")
  ) {
    return "unauthorized";
  }

  if (
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("not allowed") ||
    normalized.includes("row-level security")
  ) {
    return "forbidden";
  }

  if (
    normalized.includes("required") ||
    normalized.includes("validation") ||
    normalized.includes("invalid") ||
    normalized.includes("constraint") ||
    normalized.includes("400")
  ) {
    return "validation";
  }

  if (
    normalized.includes("not found") ||
    normalized.includes("no rows") ||
    normalized.includes("missing") ||
    normalized.includes("not available")
  ) {
    return "missing_data";
  }

  if (
    normalized.includes("duplicate") ||
    normalized.includes("already exists") ||
    normalized.includes("23505") ||
    normalized.includes("already been")
  ) {
    return "duplicate";
  }

  if (options.context === "upload") return "file_upload";
  if (options.context === "calendar") return "calendar_sync";
  if (options.context === "notification") return "notification";

  if (
    normalized.includes("upload") ||
    normalized.includes("file") ||
    normalized.includes("xlsx")
  ) {
    return "file_upload";
  }

  if (normalized.includes("calendar") || normalized.includes("evento")) {
    return "calendar_sync";
  }

  if (normalized.includes("notification") || normalized.includes("notify")) {
    return "notification";
  }

  if (
    normalized.includes("500") ||
    normalized.includes("internal") ||
    normalized.includes("server") ||
    normalized.includes("supabase") ||
    normalized.includes("database") ||
    normalized.includes("sql")
  ) {
    return "server";
  }

  return "unknown";
}

function buildAlert(
  category: AppErrorCategory,
  options: AppErrorOptions,
): Omit<NormalizedAppError, "debugMessage"> {
  switch (category) {
    case "offline":
      return {
        category,
        title: "Sem ligação à internet",
        message: "Parece que está offline. Volte a ligar-se e tente novamente.",
        severity: "warning",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "network":
      return {
        category,
        title: "Problema de ligação",
        message: "Não foi possível contactar o serviço agora. Tente novamente.",
        severity: "error",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "timeout":
      return {
        category,
        title: "O pedido demorou demasiado",
        message:
          "O pedido está a demorar mais do que o esperado. Tente novamente dentro de instantes.",
        severity: "warning",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "unauthorized":
      return {
        category,
        title: "Sessão expirada",
        message: "A sua sessão expirou. Inicie sessão novamente.",
        severity: "warning",
        actionLabel: "Iniciar sessão",
        isRetryable: false,
      };
    case "forbidden":
      return {
        category,
        title: "Acesso restrito",
        message: "Não tem permissão para concluir esta ação.",
        severity: "error",
        isRetryable: false,
      };
    case "validation":
      return {
        category,
        title: "Revise a informação",
        message:
          "Existe informação em falta ou inválida. Revise os campos assinalados.",
        severity: "warning",
        isRetryable: false,
      };
    case "missing_data":
      return {
        category,
        title: "Informação indisponível",
        message:
          "Não foi possível encontrar a informação necessária para continuar.",
        severity: "warning",
        isRetryable: false,
      };
    case "duplicate":
      return {
        category,
        title: "Ação já concluída",
        message:
          "Esta ação já tinha sido processada, por isso não houve novas alterações.",
        severity: "info",
        isRetryable: false,
      };
    case "file_upload":
      return {
        category,
        title: "Falha no upload",
        message:
          "Não foi possível processar esse ficheiro agora. Verifique o ficheiro e tente novamente.",
        severity: "error",
        actionLabel: "Tentar de novo",
        isRetryable: true,
      };
    case "calendar_sync":
      return {
        category,
        title: "Falha na sincronização do calendário",
        message:
          "Não foi possível sincronizar o calendário agora. Nenhum evento existente foi alterado.",
        severity: "error",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "notification":
      return {
        category,
        title: "Falha ao atualizar notificações",
        message:
          "Não foi possível atualizar as notificações agora. Tente novamente.",
        severity: "warning",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "server":
      return {
        category,
        title: "Ocorreu um problema",
        message:
          "Não foi possível concluir este pedido neste momento. Tente novamente.",
        severity: "error",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
    case "unknown":
    default:
      return {
        category: category ?? "unknown",
        title: "Ocorreu um problema",
        message:
          options.fallbackMessage ??
          "Não foi possível concluir este pedido neste momento.",
        severity: "error",
        actionLabel: "Tentar novamente",
        isRetryable: true,
      };
  }
}

export function normalizeAppError(
  error: unknown,
  options: AppErrorOptions = {},
): NormalizedAppError {
  const debugMessage = rawErrorMessage(error);
  const category = detectCategory(debugMessage, options);
  const alert = buildAlert(category, options);

  return {
    ...alert,
    debugMessage,
  };
}

export function toUserFacingError(
  error: unknown,
  options: AppErrorOptions = {},
): string {
  return normalizeAppError(error, options).message;
}

export function toUserFacingAlert(
  error: unknown,
  options: AppErrorOptions = {},
): AppErrorAlert {
  const normalized = normalizeAppError(error, options);
  return {
    title: normalized.title,
    message: normalized.message,
    severity: normalized.severity,
    actionLabel: normalized.actionLabel,
  };
}

export function getDebugErrorMessage(error: unknown): string {
  return rawErrorMessage(error);
}
