import { normalizeAppError } from "@/lib/app-error";

export const feedbackMessages = {
  sessionExpired:
    "A sua sessão terminou. Inicie sessão novamente para continuar.",
  sessionLogoutSuccess: "Sessão terminada com segurança.",
  missingUserSession:
    "Não foi possível confirmar a sua sessão. Inicie sessão novamente.",
  authenticationSuccess: "Sessão iniciada com sucesso.",
  profileUpdated: "Perfil atualizado com sucesso.",
  profileUpdatedInSettings: "As suas definições foram guardadas.",
  uploadSafetyFallback:
    "Para proteger o seu calendário, a remoção automática de eventos foi desativada nesta sincronização.",
  leaveSavedDraft: "Pedido guardado. Revise o email antes de o enviar ao RH.",
  leaveSentToHR:
    "O pedido foi marcado como pendente após abrir o email para o RH.",
  missingGoogleToken:
    "A ligação ao Google Calendar expirou. Inicie sessão novamente.",
  missingDefaultCalendar:
    "Escolha primeiro um calendário padrão nas definições.",
  inactivityWarning:
    "Está inativo há algum tempo. Para sua segurança, a sessão vai terminar em breve.",
  inactivityLogout: "A sessão foi terminada após um período de inatividade.",
} as const;

export function authFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "auth" }).message;
}

export function googleLoginFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "auth" }).message;
}

export function supabaseLoginFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "auth" }).message;
}

export function supabaseLogoutFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "session" }).message;
}

export function profileLoadFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "profile" }).message;
}

export function syncPreviewFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "calendar" }).message;
}

export function uploadPartialFailureMessage(error: unknown): string {
  return normalizeAppError(error, { context: "upload" }).message;
}

export function invalidTransitionMessage(
  currentStatus: string,
  nextStatusLabel: string,
): string {
  return `Este pedido não pode mudar para ${nextStatusLabel} a partir do estado atual.`;
}
