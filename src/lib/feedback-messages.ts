import { getErrorMessage } from "@/lib/getErrorMessage";

export const feedbackMessages = {
  sessionExpired: "Sessão expirada, por favor inicie sessão novamente",
  sessionLogoutSuccess: "Sessão terminada com sucesso",
  missingUserSession: "Sessão de utilizador não encontrada",
  authenticationSuccess: "Autenticação bem-sucedida!",
  profileUpdated: "Perfil atualizado com sucesso",
  profileUpdatedInSettings: "Perfil atualizado nas configurações",
  uploadSafetyFallback:
    "Para evitar eliminações incorretas, a remoção automática de eventos foi desativada nesta sincronização.",
  leaveSavedDraft: "Pedido guardado. Use o botão 'Enviar ao RH' para submeter.",
  leaveSentToHR: "Email ao RH aberto. Pedido marcado como pendente.",
  missingGoogleToken: "Sem token de acesso Google. Faz login novamente.",
  missingDefaultCalendar:
    "Nenhum calendário padrão configurado. Vai às definições e seleciona um calendário.",
} as const;

export function authFailureMessage(error: unknown): string {
  return `Falha na autenticação: ${getErrorMessage(error)}`;
}

export function googleLoginFailureMessage(error: unknown): string {
  return `Falha no login Google: ${getErrorMessage(error)}`;
}

export function supabaseLoginFailureMessage(error: unknown): string {
  return `Falha no login Supabase/Google: ${getErrorMessage(error)}`;
}

export function supabaseLogoutFailureMessage(error: unknown): string {
  return `Falha ao terminar sessão Supabase: ${getErrorMessage(error)}`;
}

export function profileLoadFailureMessage(error: unknown): string {
  return `Falha ao carregar perfil: ${getErrorMessage(error)}`;
}

export function syncPreviewFailureMessage(error: unknown): string {
  return `Falha no preview de sincronização: ${getErrorMessage(error)}`;
}

export function uploadPartialFailureMessage(error: unknown): string {
  return `Upload persistido parcialmente: ${getErrorMessage(error)}`;
}

export function invalidTransitionMessage(
  currentStatus: string,
  nextStatusLabel: string,
): string {
  return `Transição inválida: ${currentStatus} → ${nextStatusLabel}`;
}
