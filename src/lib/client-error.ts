import { clientErrorCodes, type ClientErrorCode } from "@/domain/errors";

export interface ClientError {
  code: ClientErrorCode;
  message: string;
}

const messages: Record<ClientErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Your session has expired. Sign in and try again.",
  FORBIDDEN: "You do not have permission to access this information.",
  VALIDATION: "Check your information and try again.",
  CONFLICT: "This item changed. Refresh and try again.",
  UNEXPECTED: "Something went wrong. Please try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.error) && ("name" in value.error || "code" in value.error)) {
    return value.error;
  }
  return value;
}

function knownCode(value: unknown): ClientErrorCode | null {
  return typeof value === "string" && clientErrorCodes.includes(value as ClientErrorCode)
    ? value as ClientErrorCode
    : null;
}

function codeFromError(error: Record<string, unknown>): ClientErrorCode {
  const code = knownCode(error.code);
  if (code) return code;

  switch (error.name) {
    case "AuthenticationRequiredError": return "AUTHENTICATION_REQUIRED";
    case "AuthorizationError": return "FORBIDDEN";
    case "ValidationError":
    case "ZodError": return "VALIDATION";
    case "ConflictError": return "CONFLICT";
    default: {
      const status = error.statusCode ?? error.status;
      if (status === 401) return "AUTHENTICATION_REQUIRED";
      if (status === 403) return "FORBIDDEN";
      if (status === 409) return "CONFLICT";
      if (status === 400 || status === 422) return "VALIDATION";
      return "UNEXPECTED";
    }
  }
}

/** Converts local or serialized errors into a contract safe to render in the browser. */
export function normalizeClientError(
  value: unknown,
  options: { fallback?: string; authMessage?: string } = {},
): ClientError {
  const error = errorRecord(value);
  const code = error ? codeFromError(error) : "UNEXPECTED";
  if (code === "UNEXPECTED") {
    if (error?.name === "AbortError") {
      return { code, message: "The operation was cancelled. You can try again." };
    }
    const safeMessage = error?.clientMessage;
    if (typeof safeMessage === "string" && safeMessage.trim()) {
      return { code, message: safeMessage };
    }
    return { code, message: options.fallback ?? messages.UNEXPECTED };
  }
  if (code === "AUTHENTICATION_REQUIRED" || code === "FORBIDDEN") {
    if (options.authMessage) return { code, message: options.authMessage };
    const safeMessage = error?.clientMessage;
    return {
      code,
      message: typeof safeMessage === "string" && safeMessage.trim() ? safeMessage : messages[code],
    };
  }

  const safeMessage = error?.clientMessage;
  return {
    code,
    message: typeof safeMessage === "string" && safeMessage.trim()
      ? safeMessage
      : messages[code],
  };
}
