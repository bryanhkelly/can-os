import type {PhotoWorkerEnv} from "./cloudflare-production.server";
/** Netlify-safe no-op. Cloudflare production aliases this import to a
 * Cloudflare-only binding adapter in vite.cloudflare.config.ts. */
export async function liveCloudflarePhotoEnv():Promise<PhotoWorkerEnv|null>{
  return null;
}
