import { DomainError } from "@/domain/errors";
import { normalizeClientError } from "./client-error";

export type LoaderFailureKind = ReturnType<typeof normalizeClientError>["kind"];
export type LoadOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; authError: string | null; message: string; kind?: LoaderFailureKind; retryable?: boolean };

const DEFAULT_AUTH_MESSAGE = "Sign in with an authorized account to view this page.";

/** Explicit error classes avoid guessing security state from arbitrary message text. */
export class AuthenticationRequiredError extends DomainError {
  constructor() { super("AUTHENTICATION_REQUIRED"); this.name = "AuthenticationRequiredError"; }
}
export class DataUnavailableError extends DomainError {
  constructor(message = "Data is temporarily unavailable") { super("UNAVAILABLE", message); this.name = "DataUnavailableError"; }
}
export class RetryableLoaderError extends Error {
  constructor(message = "Please try again") { super(message); this.name = "RetryableLoaderError"; }
}

export function classifyLoaderError(error: unknown): { kind: LoaderFailureKind; retryable: boolean } {
  const { kind, retryable } = normalizeClientError(error);
  return { kind, retryable };
}

/**
 * Backward-compatible loader outcome. Authorization failures are not automatically
 * treated as missing authentication, and unexpected errors are not swallowed as auth.
 */
export function safeLoader<T>(
  load: () => Promise<T>,
  options?: { authMessage?: string; onUnexpectedError?: (error: unknown) => void },
): () => Promise<LoadOutcome<T>> {
  return async () => {
    try {
      return { ok: true, data: await load() };
    } catch (error) {
      const classification = classifyLoaderError(error);
      if (classification.kind === "unexpected") {
        if (options?.onUnexpectedError) options.onUnexpectedError(error);
        else if (typeof window === "undefined") console.error("Loader failed", error);
      }
      const authError = classification.kind === "authentication"
        ? options?.authMessage ?? DEFAULT_AUTH_MESSAGE
        : classification.kind === "authorization"
          ? "You do not have permission to view this page."
          : null;
      const message = classification.kind === "unexpected"
        ? "An unexpected error occurred. Please try again."
        : classification.kind === "unavailable"
          ? "This information is temporarily unavailable."
          : authError ?? normalizeClientError(error).message;
      return { ok: false, authError, message, ...classification };
    }
  };
}
