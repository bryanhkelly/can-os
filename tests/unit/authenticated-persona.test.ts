import type { Browser, BrowserContext, Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import {
  createAccessSession,
  newSessionSecret,
  openAuthenticatedPage,
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
});
