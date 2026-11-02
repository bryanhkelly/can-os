export const clientErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "VALIDATION",
  "CONFLICT",
  "UNEXPECTED",
] as const;

export type ClientErrorCode = typeof clientErrorCodes[number];

const diagnostics = new WeakMap<ClientSafeError, string>();

export class ClientSafeError extends Error {
  constructor(
    public readonly code: ClientErrorCode,
    public readonly clientMessage: string,
    diagnosticMessage = clientMessage,
    options?: ErrorOptions,
  ) {
    super(clientMessage, options);
    this.name = new.target.name;
    diagnostics.set(this, diagnosticMessage);
  }

  get diagnosticMessage(): string {
    return diagnostics.get(this) ?? this.message;
  }
}

export class AuthenticationRequiredError extends ClientSafeError {
  constructor() {
    super("AUTHENTICATION_REQUIRED", "Your session has expired. Sign in and try again.");
  }
}

export class ValidationError extends ClientSafeError {
  constructor(message = "Check your information and try again.") {
    super("VALIDATION", message);
  }
}

export class ConflictError extends ClientSafeError {
  constructor(
    message = "This item changed. Refresh and try again.",
    diagnosticMessage = message,
  ) {
    super("CONFLICT", message, diagnosticMessage);
  }
}
