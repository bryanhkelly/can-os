import { normalizeClientError, type ClientError } from "@/lib/client-error";

export type LoadOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClientError };

/**
 * Wraps a route loader so authorization and unexpected failures render an
 * in-page state instead of surfacing as an HTTP 500. Diagnostics stay in the
 * server log; only the normalized client-safe contract reaches the browser.
 */
export function safeLoader<T>(
  load: () => Promise<T>,
  options?: { authMessage?: string },
): () => Promise<LoadOutcome<T>> {
  return async () => {
    try {
      return { ok: true, data: await load() };
    } catch (error) {
      const normalized = normalizeClientError(error, { authMessage: options?.authMessage });
      if (normalized.code === "UNEXPECTED") {
        console.error("[safeLoader] Unexpected loader failure", error);
      }
      return { ok: false, error: normalized };
    }
  };
}
