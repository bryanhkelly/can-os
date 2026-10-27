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
  await context.addCookies([{
    name: accessSessionCookie,
    value: secret,
    url: origin,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  }]);
  return { context, page: await context.newPage() };
}
