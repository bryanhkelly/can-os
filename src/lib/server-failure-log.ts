import { normalizeClientError } from "./client-error";

type FailureEvent = "Server function failed" | "Unable to load workspace session";

/** Allowlisted classifications only. Exceptions may contain SQL, bindings,
 * connection strings, student records or nested driver causes. */
export function logServerFailure(event: FailureEvent, error: unknown): void {
  const { code, kind, retryable } = normalizeClientError(error);
  console.error(event, { code, kind, retryable });
}
