export function isValidEmail(
  email: string | null | undefined,
): email is string {
  if (typeof email !== "string") return false;
  const normalized = email.trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeEmailList(
  emails: Array<string | null | undefined>,
): string[] {
  const dedup = new Set<string>();
  for (const raw of emails) {
    if (!raw) continue;
    const normalized = raw.trim().toLowerCase();
    if (!normalized) continue;
    if (!isValidEmail(normalized)) continue;
    dedup.add(normalized);
  }
  return [...dedup];
}

export function buildHrCcList(input: {
  configuredCcEmails?: string[];
  actorEmail: string;
}): string[] {
  return normalizeEmailList([
    ...(input.configuredCcEmails ?? []),
    input.actorEmail,
  ]);
}
