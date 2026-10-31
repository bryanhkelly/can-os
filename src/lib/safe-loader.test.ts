import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";
import { AuthenticationRequiredError, DataUnavailableError, RetryableLoaderError, classifyLoaderError, safeLoader } from "./safe-loader";

describe("safeLoader", () => {
  it("returns successful data unchanged", async () => {
    expect(await safeLoader(async () => ({ id: "a" }))()).toEqual({ ok: true, data: { id: "a" } });
  });
  it("distinguishes session and permission failures", async () => {
    const session = await safeLoader(async () => { throw new AuthenticationRequiredError(); })();
    const permission = await safeLoader(async () => { throw new AuthorizationError("grades"); })();
    expect(session.ok).toBe(false);
    expect(permission.ok).toBe(false);
    if (!session.ok && !permission.ok) {
      expect(session.kind).toBe("authentication");
      expect(permission.kind).toBe("authorization");
    }
  });
  it("recognizes the existing missing-session authorization marker", () => {
    expect(classifyLoaderError(new AuthorizationError("authenticated session")).kind).toBe("authentication");
    expect(classifyLoaderError(new AuthorizationError("grades")).kind).toBe("authorization");
  });
  it("does not infer authorization from a misleading message", () => {
    expect(classifyLoaderError(new Error("not authorized by downstream API")).kind).toBe("unexpected");
  });
  it("marks unavailable and retryable failures", () => {
    expect(classifyLoaderError(new DataUnavailableError()).retryable).toBe(true);
    expect(classifyLoaderError(new RetryableLoaderError()).retryable).toBe(true);
  });
  it("reports unexpected errors without exposing internal details", async () => {
    const report = vi.fn();
    const outcome = await safeLoader(async () => { throw new Error("secret database URL"); }, { onUnexpectedError: report })();
    expect(report).toHaveBeenCalledOnce();
    if (!outcome.ok) expect(outcome.message).not.toContain("secret");
  });
});
