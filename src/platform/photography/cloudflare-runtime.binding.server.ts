// Cloudflare-only module, selected by vite.cloudflare.config.ts.
// It must never be resolved by the Netlify production build.
// @ts-ignore Cloudflare built-in bindings are provided by the Workers runtime.
import {env} from "cloudflare:workers";
import type {PhotoWorkerEnv} from "./cloudflare-production.server";

export async function liveCloudflarePhotoEnv():Promise<PhotoWorkerEnv|null>{
  const values=env as unknown as PhotoWorkerEnv;
  return values?.TEMPLATE_PHOTO_BUCKET?values:null;
}
