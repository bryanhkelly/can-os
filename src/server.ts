import handler from "@tanstack/react-start/server-entry";
import type {PhotoWorkerEnv} from "./platform/photography/cloudflare-production.server";

/**
 * TanStack Start's canonical auto-detected custom server entry.
 * Netlify uses fetch as normal; only Cloudflare invokes scheduled.
 */
export default {
  fetch(request:Request):Promise<Response>|Response {
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
