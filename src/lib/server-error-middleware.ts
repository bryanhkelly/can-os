import { createMiddleware } from "@tanstack/react-start";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { normalizeClientError } from "./client-error";

export function sanitizeServerError(error: unknown): Error {
  const normalized = normalizeClientError(error);
  if (normalized.kind === "unexpected") console.error("Server function failed", error);
  // Only these safe fields cross the server-function serialization boundary.
  return Object.assign(new Error(normalized.message), {
    name: "ClientSafeError", code: normalized.code,
    retryable: normalized.retryable,
  });
}

export async function withSafeServerErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response || isRedirect(error) || isNotFound(error)) throw error;
    throw sanitizeServerError(error);
  }
}

export const serverErrorMiddleware = createMiddleware({ type: "function" }).server(({ next }) => {
  return withSafeServerErrors(next);
});
