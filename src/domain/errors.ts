export const clientErrorCodes = [
  "AUTHENTICATION_REQUIRED", "FORBIDDEN", "VALIDATION_FAILED", "CONFLICT",
  "UNAVAILABLE", "CANCELLED", "UNEXPECTED",
] as const;
export type ClientErrorCode = typeof clientErrorCodes[number];

export const clientErrorMessages: Record<ClientErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Sign in with an authorized account to continue.",
  FORBIDDEN: "You do not have permission to perform this operation.",
  VALIDATION_FAILED: "Check the entered information and try again.",
  CONFLICT: "This record has changed. Refresh the page before trying again.",
  UNAVAILABLE: "This information is temporarily unavailable.",
  CANCELLED: "The upload was cancelled. Retry when you are ready.",
  UNEXPECTED: "An unexpected error occurred. Please try again.",
};

/** Diagnostic messages stay on the server; clients use the explicit code. */
export class DomainError extends Error {
  readonly code: string;
  constructor(code: ClientErrorCode, diagnostic?: string) {
    super(diagnostic ?? clientErrorMessages[code]);
    this.code = code;
    this.name = "DomainError";
  }
}
