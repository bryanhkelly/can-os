import { afterEach, describe, expect, it, vi } from "vitest";
import { toCrossJSONAsync } from "seroval";
import { AuthorizationError } from "@/domain/command-context";
import { AuthenticationRequiredError, ConflictError, ValidationError } from "@/domain/errors";
import { normalizeClientError } from "@/lib/client-error";
import { toClientSafeServerError } from "@/lib/server-error-middleware";
import { safeLoader } from "@/lib/safe-loader";

afterEach(() => vi.restoreAllMocks());

describe("client-safe error normalization", () => {
  it("uses explicit authorization codes, not message substrings", () => {
    expect(normalizeClientError(new AuthorizationError("student assignments:read"), {
      authMessage: "Sign in with an authorized student account.",
    })).toEqual({
      code: "FORBIDDEN",
      message: "Sign in with an authorized student account.",
    });
    expect(normalizeClientError(new Error("not authorized to use this text"))).toEqual({
      code: "UNEXPECTED",
      message: "Something went wrong. Please try again.",
    });
  });

  it("normalizes explicit authentication, validation and conflict failures", () => {
    expect(normalizeClientError(new AuthenticationRequiredError()).code).toBe("AUTHENTICATION_REQUIRED");
    expect(normalizeClientError(new ValidationError("Enter a valid email address."))).toEqual({
      code: "VALIDATION",
      message: "Enter a valid email address.",
    });
    expect(normalizeClientError(new ConflictError("This offer has changed."))).toEqual({
      code: "CONFLICT",
      message: "This offer has changed.",
    });
  });

  it("handles serialized server errors without exposing internal diagnostics", () => {
    expect(normalizeClientError({
      error: {
        name: "AuthorizationError",
        code: "FORBIDDEN",
        message: "Missing internal capability: student:id",
        clientMessage: "You do not have permission to access this information.",
      },
    })).toEqual({
      code: "FORBIDDEN",
      message: "You do not have permission to access this information.",
    });
    expect(normalizeClientError({ name: "ZodError", message: "secret validation details" }).code).toBe("VALIDATION");
    expect(normalizeClientError({ status: 409, message: "internal conflict details" }).message)
      .toBe("This item changed. Refresh and try again.");
  });

  it("serializes coded errors with only the client-safe message", async () => {
    const error = new AuthorizationError("private capability detail");
    const payload = JSON.stringify(await toCrossJSONAsync({ error }));
    expect(payload).toContain('"code","clientMessage"');
    expect(payload).toContain("You do not have permission to access this information.");
    expect(payload).not.toContain("private capability detail");
    expect(error.message).toBe("You do not have permission to access this information.");
    expect(error.diagnosticMessage).toContain("private capability detail");
  });

  it("logs unexpected server diagnostics and emits a coded safe error for serialization", async () => {
    const diagnostic = new Error("database URL includes secret details");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const safe = toClientSafeServerError(diagnostic);
    expect(safe.code).toBe("UNEXPECTED");
    expect(safe.clientMessage).toBe("Something went wrong. Please try again.");
    expect(safe.message).toBe(safe.clientMessage);
    expect(safe.diagnosticMessage).toBe(diagnostic.message);
    expect(log).toHaveBeenCalledWith("[server function] Unexpected failure", diagnostic);
    const payload = JSON.stringify(await toCrossJSONAsync({ error: safe }));
    expect(payload).toContain("Something went wrong. Please try again.");
    expect(payload).not.toContain("database URL includes secret details");
  });
});

describe("safeLoader", () => {
  it("wraps a successful load as { ok: true, data }", async () => {
    await expect(safeLoader(async () => ({ value: 42 }))()).resolves.toEqual({
      ok: true, data: { value: 42 },
    });
  });

  it("uses the supplied access message for an authorization failure", async () => {
    const outcome = await safeLoader(
      async () => { throw new AuthorizationError("assignments:read"); },
      { authMessage: "Sign in with an authorized student account." },
    )();
    expect(outcome).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Sign in with an authorized student account." },
    });
  });

  it("classifies serialized authentication failures", async () => {
    const outcome = await safeLoader(async () => {
      throw { error: { name: "AuthenticationRequiredError", message: "session secret" } };
    })();
    expect(outcome).toEqual({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED", message: "Your session has expired. Sign in and try again." },
    });
  });

  it("logs unexpected diagnostic details on the server and returns only a generic client message", async () => {
    const diagnostic = new Error("database connection refused");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await safeLoader(async () => { throw diagnostic; })();
    expect(outcome).toEqual({
      ok: false,
      error: { code: "UNEXPECTED", message: "Something went wrong. Please try again." },
    });
    expect(JSON.stringify(outcome)).not.toContain("database connection refused");
    expect(log).toHaveBeenCalledWith("[safeLoader] Unexpected loader failure", diagnostic);
  });

  it("does not stringify non-Error rejections into client-visible diagnostics", async () => {
    const outcome = await safeLoader(async () => { throw "private server detail"; })();
    expect(outcome).toEqual({
      ok: false,
      error: { code: "UNEXPECTED", message: "Something went wrong. Please try again." },
    });
    expect(JSON.stringify(outcome)).not.toContain("private server detail");
  });
});
