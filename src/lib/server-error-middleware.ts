import { createMiddleware } from "@tanstack/react-start";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { normalizeClientError, type ClientError } from "./client-error";

type ClientSafeError = Pick<ClientError, "code" | "message" | "retryable"> & { name: "ClientSafeError" };

export function sanitizeServerError(error: unknown): ClientSafeError {
  const normalized = normalizeClientError(error);
  if (normalized.kind === "unexpected") console.error("Server function failed", error);
  // Start's shallow Error serializer drops custom fields; use a plain safe DTO.
  return {
    name: "ClientSafeError", code: normalized.code, message: normalized.message,
    retryable: normalized.retryable,
  };
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
