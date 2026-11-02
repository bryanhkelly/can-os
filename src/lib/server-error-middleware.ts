import { ClientSafeError } from "@/domain/errors";
import { normalizeClientError } from "@/lib/client-error";

export function toClientSafeServerError(error: unknown): ClientSafeError {
  const clientError = normalizeClientError(error);
  const diagnostic = error instanceof Error ? error.message : "Server function rejected with a non-Error value.";
  if (clientError.code === "UNEXPECTED") {
    console.error("[server function] Unexpected failure", error);
  }
  return new ClientSafeError(clientError.code, clientError.message, diagnostic);
}
