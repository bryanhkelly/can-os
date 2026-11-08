import type {PhotoWorkerEnv} from "./cloudflare-production.server";

/**
 * Resolve Cloudflare's native bindings only inside a server request.
 * On Netlify this intentionally returns null and the existing signed S3 route
 * remains available. No secret value is serialized to the client.
 */
export async function liveCloudflarePhotoEnv():Promise<PhotoWorkerEnv|null>{
  try{
    // Keep the import runtime-only so the Netlify SSR bundler does not try to
    // resolve the Cloudflare built-in module at build time.
    const id="cloudflare:workers";
    const runtime=await import(/* @vite-ignore */ id) as {env?:PhotoWorkerEnv};
    return runtime.env?.TEMPLATE_PHOTO_BUCKET?runtime.env:null;
  }catch{return null;}
}
