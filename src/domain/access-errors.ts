export class InvalidAccessCredentialError extends Error {
  constructor(message = "Invalid or expired access link") {
    super(message);
    this.name = "InvalidAccessCredentialError";
  }
}

/** Never log raw authentication errors: drivers may include credentials or SQL values. */
export function logAuthenticationUnavailable(stage: "admission" | "verification" | "rejection_audit" | "email_request") {
  console.error("Authentication temporarily unavailable", { stage });
}
