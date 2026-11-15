export class InvalidAccessCredentialError extends Error {
  constructor(message = "Invalid or expired access link") {
    super(message);
    this.name = "InvalidAccessCredentialError";
  }
}

export type AccessFailureReason = "session_configuration" | "account_lookup" |
  "grant_lookup" | "session_creation" | "session_audit" | "session_transaction";

/** Only application-owned categories may cross the authentication log boundary. */
export class AccessInfrastructureError extends Error {
  constructor(readonly reason: AccessFailureReason) {
    super("Authentication infrastructure unavailable");
    this.name = "AccessInfrastructureError";
  }
}

/** Never log raw authentication errors: drivers may include credentials or SQL values. */
export function logAuthenticationUnavailable(
  stage: "admission" | "verification" | "rejection_audit" | "email_request" | "personal_registration",
  error?: unknown,
) {
  console.error("Authentication temporarily unavailable", {
    stage,
    ...(error instanceof AccessInfrastructureError ? { reason: error.reason } : {}),
  });
}
