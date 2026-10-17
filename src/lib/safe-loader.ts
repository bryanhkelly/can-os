import { AuthorizationError } from "@/domain/command-context";

export type LoadOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; authError: string | null; message: string };

const DEFAULT_AUTH_MESSAGE = "Sign in with an authorized account to view this page.";

// Server-function errors can cross the wire serialized, where `instanceof`
// no longer matches; fall back to conservative name/message markers.
function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof AuthorizationError || error.name === "AuthorizationError") return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("authorized") ||
    message.includes("role:") ||
    message.includes("capability")
  );
}

/**
 * Wraps a route loader so authorization and unexpected failures render an
 * in-page state instead of surfacing as an HTTP 500. Never rethrows.
 */
export function safeLoader<T>(
  load: () => Promise<T>,
  options?: { authMessage?: string },
): () => Promise<LoadOutcome<T>> {
  return async () => {
    try {
      return { ok: true, data: await load() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthError(error)) {
        return { ok: false, authError: options?.authMessage ?? DEFAULT_AUTH_MESSAGE, message };
      }
      return { ok: false, authError: null, message };
    }
  };
}
