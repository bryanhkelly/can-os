import { createBrowserApiClient } from "../../../apps/api/sdk/client";
import type { paths } from "../../../apps/api/sdk/client";

type JsonBody<P extends keyof paths> = paths[P] extends {
  post: { requestBody: { content: { "application/json": infer Body } } };
} ? Body : never;

export type SiteSignupInput = JsonBody<"/api/v1/access/site-signups">;
export type AccountRegistrationInput = JsonBody<"/api/v1/access/register">;

// Construct only at the point of a browser interaction, never during SSR.
// No RPC fallback or alternate credentials; generated SDK owns HTTP transport.
export function requestSiteSignup(body: SiteSignupInput) {
  return createBrowserApiClient().POST("/api/v1/access/site-signups", { body });
}
export function registerAccount(body: AccountRegistrationInput) {
  return createBrowserApiClient().POST("/api/v1/access/register", { body });
}
