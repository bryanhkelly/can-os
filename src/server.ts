import handler from "@tanstack/react-start/server-entry";
import type {PhotoWorkerEnv} from "./platform/photography/cloudflare-production.server";

/**
 * TanStack Start's canonical auto-detected custom server entry.
 * Netlify uses fetch as normal; only Cloudflare invokes scheduled.
 */
export default {
  async fetch(request:Request,platform?:unknown):Promise<Response> {
    // Preserve existing Cloudflare-specific origin checks, throttling and
    // response security headers. Ordinary Netlify requests use TanStack.
    if(platform && typeof platform==="object" &&
       "ACCESS_REQUEST_LIMIT" in platform && "ACCESS_VERIFY_LIMIT" in platform){
      const worker=await import("./cloudflare-demo");
      return worker.default.fetch(request,
        platform as Parameters<typeof worker.default.fetch>[1]);
    }
    return handler.fetch(request);
  },
  scheduled(_event:unknown,env:PhotoWorkerEnv,ctx:{waitUntil(task:Promise<unknown>):void}):void {
    ctx.waitUntil(import("./platform/photography/cloudflare-production.server")
      .then(({runBoundTemplatePhotoProduction})=>runBoundTemplatePhotoProduction(env))
      .then(result=>console.info("CAN photography cron result",result))
      .catch(error=>console.error("CAN photography cron failed",{
        type:error instanceof Error?error.name:"unknown",
        message:error instanceof Error?error.message.slice(0,130):"unknown",
      })));
  },
};
