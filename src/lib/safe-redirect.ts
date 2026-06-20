/**
 * Validazione path sicuri per redirect — impedisce open redirect
 * via header Referer o parametri user-controllabili.
 */

/** Accetta solo path relativi (/admin/...) — blocca URL esterni e protocolli mascherati */
export function safeRedirectPath(value: string | null, fallback: string): string {
  if (!value) return fallback;

  // Deve iniziare con / ma non con // (protocollo relativo)
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  // Verifica che non contenga protocolli mascherati (es. /\evil.com)
  try {
    const url = new URL(value, "http://localhost");
    if (url.hostname !== "localhost") return fallback;
  } catch {
    return fallback;
  }

  return value;
}
