import { randomBytes } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  accessSessionCookie,
  hashAccessSecret,
} from "../../../src/domain/access-tokens";
import { TEST_ACCESS_TOKEN_PEPPER, baseURL } from "../env";
import type { Sql } from "../fixture";

export interface AuthenticatedPage {
  context: BrowserContext;
  page: Page;
}

/** Opaque session secret; 43 base64url chars satisfies the access-token contract. */
export function newSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Insert the same hashed server-side session shape as passwordless redemption.
 * Only the returned opaque secret may cross into the browser.
 */
export async function createAccessSession(
  sql: Sql,
  input: {
    accountId: string;
    activeGrantId: string;
    expiresAt: Date;
    secret?: string;
  },
): Promise<string> {
  const secret = input.secret ?? newSessionSecret();
  await sql.query(
    `insert into access_sessions (account_id, secret_hash, active_grant_id, expires_at)
     values ($1, $2, $3, $4)`,
    [
      input.accountId,
      hashAccessSecret(secret, TEST_ACCESS_TOKEN_PEPPER),
      input.activeGrantId,
      input.expiresAt.toISOString(),
    ],
  );
  return secret;
}

/**
 * Open one independently authenticated browser persona. The __Host- cookie uses
 * a URL rather than a Domain attribute and remains Secure on trusted localhost.
 */
export async function openAuthenticatedPage(
  browser: Browser,
  secret: string,
  origin: string = baseURL,
): Promise<AuthenticatedPage> {
  const context = await browser.newContext({ baseURL: origin });
  try {
    const page = await context.newPage();
    const cookieUrl = new URL("/__can_e2e_session__", origin).toString();
    // Chromium rejects direct Secure-cookie injection for an http URL, while
    // correctly trusting the same cookie from a localhost response.
    await page.route(cookieUrl, route => route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Set-Cookie": `${accessSessionCookie}=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax`,
      },
      body: "Synthetic session established",
    }));
    await page.goto(cookieUrl);
    await page.unroute(cookieUrl);
    return { context, page };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

type AuthenticatedPersonas<Secrets extends Record<string, string>> = {
  [Name in keyof Secrets]: AuthenticatedPage;
};

/**
 * Open named personas for one scope and always close every context that was
 * created, including when a later setup or the callback fails.
 */
export async function withAuthenticatedPages<
  const Secrets extends Record<string, string>,
  Result,
>(
  browser: Browser,
  secrets: Secrets,
  run: (personas: AuthenticatedPersonas<Secrets>) => Promise<Result>,
  origin: string = baseURL,
): Promise<Result> {
  const opened: AuthenticatedPage[] = [];
  try {
    for (const secret of Object.values(secrets)) {
      opened.push(await openAuthenticatedPage(browser, secret, origin));
    }
    const personas = Object.fromEntries(
      Object.keys(secrets).map((name, index) => [name, opened[index]]),
    ) as AuthenticatedPersonas<Secrets>;
    return await run(personas);
  } finally {
    await Promise.all(opened.map(({ context }) => context.close()));
  }
}

/** Open one persona for a callback and guarantee browser-context teardown. */
export async function withAuthenticatedPage<Result>(
  browser: Browser,
  secret: string,
  run: (persona: AuthenticatedPage) => Promise<Result>,
  origin: string = baseURL,
): Promise<Result> {
  return withAuthenticatedPages(
    browser,
    { persona: secret },
    async ({ persona }) => run(persona),
    origin,
  );
}
