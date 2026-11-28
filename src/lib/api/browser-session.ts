import { createBrowserApiClient } from "../../../apps/api/sdk/client";
import { requireApiData, requireApiStatus } from "./api-response";

export async function readCurrentApiIdentity(signal?: AbortSignal) {
  return requireApiData(await createBrowserApiClient().GET("/api/v1/me", { signal }));
}
export async function selectApiMembership(grantId: string) {
  const { response } = await createBrowserApiClient().POST("/api/v1/me/session/membership", { body: { grantId } });
  requireApiStatus(response, 204);
}
export async function recordApiSessionActivity() {
  const { response } = await createBrowserApiClient().POST("/api/v1/me/session/activity", { body: {} });
  requireApiStatus(response, 204);
}
export async function logoutApiSession() {
  const { response } = await createBrowserApiClient().POST("/api/v1/access/logout", { body: {} });
  requireApiStatus(response, 204);
}
