import { describe, expect, it } from "vitest";
import { safeLoader } from "@/lib/safe-loader";
import { AuthorizationError } from "@/domain/command-context";

describe("safeLoader", () => {
  it("wraps a successful load as { ok: true, data }", async () => {
    const loader = safeLoader(async () => ({ value: 42 }));
    const outcome = await loader();
    expect(outcome).toEqual({ ok: true, data: { value: 42 } });
  });

  it("maps AuthorizationError to the auth branch with a custom message", async () => {
    const loader = safeLoader(
      async () => { throw new AuthorizationError("assignments:read"); },
      { authMessage: "Sign in with an authorized student account." },
    );
    const outcome = await loader();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.authError).toBe("You do not have permission to view this page.");
    expect(outcome.message).toBe("You do not have permission to view this page.");
  });

  it("uses a default auth message when none is provided", async () => {
    const loader = safeLoader(async () => { throw new AuthorizationError("admissions:decide"); });
    const outcome = await loader();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.authError).toBe("You do not have permission to view this page.");
  });

  it("maps a generic Error to the non-auth error branch", async () => {
    const loader = safeLoader(async () => { throw new Error("database connection refused"); });
    const outcome = await loader();
    expect(outcome).toEqual({ ok: false, authError: null, message: "An unexpected error occurred. Please try again.", kind: "unexpected", retryable: false });
  });

  it("still matches auth-shaped errors that lose their prototype across the wire", async () => {
    const loader = safeLoader(async () => {
      const error = new Error("Missing required capability or scope: admissions:decide");
      error.name = "AuthorizationError";
      Object.setPrototypeOf(error, Error.prototype);
      throw error;
    });
    const outcome = await loader();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.authError).not.toBeNull();
  });

  it("never throws out of the wrapper, even for non-Error rejections", async () => {
    const loader = safeLoader(async () => { throw "plain string failure"; });
    await expect(loader()).resolves.toEqual({ ok: false, authError: null, message: "An unexpected error occurred. Please try again.", kind: "unexpected", retryable: false });
  });
});
