import type { Browser, BrowserContext, Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import {
  createAccessSession,
  newSessionSecret,
  openAuthenticatedPage,
  withAuthenticatedPage,
  withAuthenticatedPages,
} from "../e2e/helpers/authenticated-persona";
import { TEST_ACCESS_TOKEN_PEPPER, baseURL } from "../e2e/env";
import type { Sql } from "../e2e/fixture";

describe("authenticated browser persona primitives", () => {
  it("creates opaque secrets accepted by the access-token contract", () => {
    const first = newSessionSecret();
    const second = newSessionSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first).not.toBe(second);
  });

  it("persists only the peppered session hash and preserves account, grant and expiry", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const expiresAt = new Date("2026-10-28T12:00:00.000Z");
    const secret = await createAccessSession({ query } as unknown as Sql, {
      accountId: "account-id",
      activeGrantId: "grant-id",
      expiresAt,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain("insert into access_sessions");
    expect(params).toEqual([
      "account-id",
      hashAccessSecret(secret, TEST_ACCESS_TOKEN_PEPPER),
      "grant-id",
      expiresAt.toISOString(),
    ]);
    expect(params).not.toContain(secret);
  });

  it("opens an isolated page with a host-only, secure, HTTP-only session cookie", async () => {
    const context = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({ id: "page" } as unknown as Page),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context as unknown as BrowserContext),
    };

    const result = await openAuthenticatedPage(browser as unknown as Browser, "opaque-secret");

    expect(browser.newContext).toHaveBeenCalledWith({ baseURL });
    expect(context.addCookies).toHaveBeenCalledWith([{
      name: accessSessionCookie,
      value: "opaque-secret",
      url: baseURL,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    }]);
    const cookie = context.addCookies.mock.calls[0]?.[0][0] as Record<string, unknown>;
    expect(cookie).not.toHaveProperty("domain");
    expect(result.page).toEqual({ id: "page" });
    expect(result.context).toBe(context);
  });

  it("supports the suite-specific application origin without changing cookie flags", async () => {
    const context = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({} as Page),
    };
    const browser = { newContext: vi.fn().mockResolvedValue(context as unknown as BrowserContext) };
    const origin = "http://localhost:3188";

    await openAuthenticatedPage(browser as unknown as Browser, "opaque-secret", origin);

    expect(browser.newContext).toHaveBeenCalledWith({ baseURL: origin });
    expect(context.addCookies).toHaveBeenCalledWith([expect.objectContaining({
      url: origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    })]);
  });

  it("closes a new context when its cookie or page setup fails", async () => {
    const context = {
      addCookies: vi.fn().mockRejectedValue(new Error("cookie rejected")),
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context as unknown as BrowserContext),
    };

    await expect(openAuthenticatedPage(
      browser as unknown as Browser,
      "opaque-secret",
    )).rejects.toThrow("cookie rejected");
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  it("closes a scoped persona after the callback succeeds", async () => {
    const page = { id: "page" } as unknown as Page;
    const context = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context as unknown as BrowserContext),
    };

    const result = await withAuthenticatedPage(
      browser as unknown as Browser,
      "opaque-secret",
      async () => "completed",
    );

    expect(result).toBe("completed");
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("closes a scoped persona when the callback fails", async () => {
    const context = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({} as Page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context as unknown as BrowserContext),
    };
    const failure = new Error("assertion failed");

    await expect(withAuthenticatedPage(
      browser as unknown as Browser,
      "opaque-secret",
      async () => { throw failure; },
    )).rejects.toBe(failure);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("returns named personas and closes every context after the group scope", async () => {
    const guardianContext = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({ id: "guardian" } as unknown as Page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const registrarContext = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({ id: "registrar" } as unknown as Page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(guardianContext as unknown as BrowserContext)
        .mockResolvedValueOnce(registrarContext as unknown as BrowserContext),
    };

    const personas = await withAuthenticatedPages(
      browser as unknown as Browser,
      { guardian: "guardian-secret", registrar: "registrar-secret" },
      async opened => opened,
    );

    expect(personas.guardian.page).toEqual({ id: "guardian" });
    expect(personas.registrar.page).toEqual({ id: "registrar" });
    expect(guardianContext.close).toHaveBeenCalledTimes(1);
    expect(registrarContext.close).toHaveBeenCalledTimes(1);
  });

  it("closes already-opened personas when a later context setup fails", async () => {
    const guardianContext = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue({} as Page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(guardianContext as unknown as BrowserContext)
        .mockRejectedValueOnce(new Error("browser unavailable")),
    };
    const run = vi.fn();

    await expect(withAuthenticatedPages(
      browser as unknown as Browser,
      { guardian: "guardian-secret", registrar: "registrar-secret" },
      run,
    )).rejects.toThrow("browser unavailable");
    expect(run).not.toHaveBeenCalled();
    expect(guardianContext.close).toHaveBeenCalledTimes(1);
  });
});
