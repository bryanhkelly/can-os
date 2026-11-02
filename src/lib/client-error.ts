import { clientErrorCodes, clientErrorMessages, type ClientErrorCode } from "@/domain/errors";

export type ClientError = {
  code: ClientErrorCode;
  kind: "authentication" | "authorization" | "validation" | "conflict" | "unavailable" | "unexpected";
  message: string;
  retryable: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeClientError(error: unknown, fallback?: string): ClientError {
  let code: ClientErrorCode = "UNEXPECTED";
  if (record(error)) {
    const explicitCode=clientErrorCodes.find(value=>value===error.code);
    if (explicitCode) {
      code = explicitCode;
    } else if (error.name === "AuthenticationRequiredError") {
      code = "AUTHENTICATION_REQUIRED";
    } else if (error.name === "AuthorizationError") {
      code = "FORBIDDEN";
    } else if (error.name === "ZodError" || error.name === "ValidationError") {
      code = "VALIDATION_FAILED";
    } else if (error.name === "ConflictError") {
      code = "CONFLICT";
    } else if (error.name === "DataUnavailableError") {
      code = "UNAVAILABLE";
    }
  }
  const kinds = {
    AUTHENTICATION_REQUIRED: "authentication", FORBIDDEN: "authorization",
    VALIDATION_FAILED: "validation", CONFLICT: "conflict",
    UNAVAILABLE: "unavailable", UNEXPECTED: "unexpected",
    CANCELLED: "unavailable",
  } as const;
  return {
    code,
    kind: kinds[code],
    message: code === "UNEXPECTED" && fallback ? fallback : clientErrorMessages[code],
    retryable: code === "UNAVAILABLE" || (record(error) && code === "UNEXPECTED" &&
      (error.name === "RetryableLoaderError" || (error.name === "ClientSafeError" && error.retryable === true))),
  };
}
