import { AuthorizationError } from "@/domain/command-context";

export type LoaderFailureKind = "authentication" | "authorization" | "unavailable" | "unexpected";
export type LoadOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; authError: string | null; message: string; kind?: LoaderFailureKind; retryable?: boolean };

const DEFAULT_AUTH_MESSAGE = "Sign in with an authorized account to view this page.";

/** Explicit error classes avoid guessing security state from arbitrary message text. */
export class AuthenticationRequiredError extends Error {
  constructor() { super("Authentication required"); this.name = "AuthenticationRequiredError"; }
}
export class DataUnavailableError extends Error {
  constructor(message = "Data is temporarily unavailable") { super(message); this.name = "DataUnavailableError"; }
}
export class RetryableLoaderError extends Error {
  constructor(message = "Please try again") { super(message); this.name = "RetryableLoaderError"; }
}

export function classifyLoaderError(error: unknown): { kind: LoaderFailureKind; retryable: boolean } {
  const name = error instanceof Error ? error.name : "";
  if (error instanceof AuthenticationRequiredError || name === "AuthenticationRequiredError")
    return { kind: "authentication", retryable: false };
  // The existing verified-session provider uses this exact capability marker
  // for a missing session. Do not treat other capability denials as sign-in.
  if (name === "AuthorizationError" &&
      error instanceof Error &&
      error.message === "Missing required capability or scope: authenticated session")
    return { kind: "authentication", retryable: false };
  if (error instanceof AuthorizationError || name === "AuthorizationError")
    return { kind: "authorization", retryable: false };
  if (error instanceof DataUnavailableError || name === "DataUnavailableError")
    return { kind: "unavailable", retryable: true };
  if (error instanceof RetryableLoaderError || name === "RetryableLoaderError")
    return { kind: "unexpected", retryable: true };
  return { kind: "unexpected", retryable: false };
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
      if (classification.kind === "unexpected") options?.onUnexpectedError?.(error);
      const authError = classification.kind === "authentication"
        ? options?.authMessage ?? DEFAULT_AUTH_MESSAGE
        : classification.kind === "authorization"
          ? "You do not have permission to view this page."
          : null;
      const message = classification.kind === "unexpected"
        ? "An unexpected error occurred. Please try again."
        : classification.kind === "unavailable"
          ? "This information is temporarily unavailable."
          : authError ?? "Unable to load this page.";
      return { ok: false, authError, message, ...classification };
    }
  };
}
