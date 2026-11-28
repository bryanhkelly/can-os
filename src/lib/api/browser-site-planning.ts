import { createBrowserApiClient } from "../../../apps/api/sdk/client";
import type { paths } from "../../../apps/api/sdk/client";
import { requireApiData } from "./api-response";

type JsonBody<P extends keyof paths> = paths[P] extends {
  post: { requestBody: { content: { "application/json": infer Body } } };
} ? Body : never;

type InformationBody = JsonBody<"/api/v1/sites/{siteId}/information">;
type AudiencesBody = JsonBody<"/api/v1/sites/{siteId}/programs-audiences">;

export async function readProgramReferences(siteId: string, signal?: AbortSignal) {
  return requireApiData(await createBrowserApiClient().GET("/api/v1/sites/{siteId}/program-references", {
    params: { path: { siteId } }, signal,
  }));
}

export async function saveSiteInformation(siteId: string, body: InformationBody) {
  return requireApiData(await createBrowserApiClient().POST("/api/v1/sites/{siteId}/information", {
    params: { path: { siteId } }, body,
  }));
}

export async function saveSiteProgramsAudiences(siteId: string, body: AudiencesBody) {
  return requireApiData(await createBrowserApiClient().POST("/api/v1/sites/{siteId}/programs-audiences", {
    params: { path: { siteId } }, body,
  }));
}
