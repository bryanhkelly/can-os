import handler from "@tanstack/react-start/server-entry";
import type {PhotoWorkerEnv} from "./platform/photography/cloudflare-production.server";
import {withRequestDatabase} from "./db/client";
import {runSessionDeviceRetention} from "./workers/session-device-retention";
type CloudflareScheduledEnv=PhotoWorkerEnv&{
 DATABASE_URL?:string;
 CAN_SESSION_DEVICE_RETENTION_ENABLED?:string;
};

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
  scheduled(_event:unknown,env:CloudflareScheduledEnv,ctx:{waitUntil(task:Promise<unknown>):void}):void {
    ctx.waitUntil(import("./platform/photography/cloudflare-production.server")
      .then(({runBoundTemplatePhotoProduction})=>runBoundTemplatePhotoProduction(env))
      .then(result=>console.info("CAN photography cron result",result))
      .catch(error=>console.error("CAN photography cron failed",{
        type:error instanceof Error?error.name:"unknown",
        message:error instanceof Error?error.message.slice(0,130):"unknown",
      })));
    // The same durable outbox is also handled by the Node maintenance runner.
    // DB row leases make both paths safe if they overlap. Mail is sent only
    // after the invitation transaction has committed and is reauthorized.
    if(env.DATABASE_URL){
      ctx.waitUntil(withRequestDatabase(
        async()=>{
          const {processNoncreditWaitlistEmailDeliveries}=await import(
            "./modules/enrollment/noncredit-waitlist-delivery.server"
          );
          return processNoncreditWaitlistEmailDeliveries();
        },
        env.DATABASE_URL,
      ).then(result=>{
        if(result.accepted||result.failed||result.suppressed)
          console.info("CAN waitlist email dispatch",result);
      }).catch(error=>{
        console.error("CAN waitlist email dispatch failed",{
          type:error instanceof Error?error.name:"unknown",
        });
      }));
    }
    // Independent of photography. A Neon transaction lease prevents more
    // than one actual cleanup per 24 hours on the once-a-minute Worker cron.
    if(env.CAN_SESSION_DEVICE_RETENTION_ENABLED==="1"){
      ctx.waitUntil(withRequestDatabase(
        () => runSessionDeviceRetention(true),
        env.DATABASE_URL??process.env.DATABASE_URL,
      ).then(executed=>{
        if(executed)console.info("CAN session metadata retention completed");
      }).catch(error=>{
        // Logs never contain raw network addresses, database URLs or SQL.
        console.error("CAN session metadata retention failed",{
          type:error instanceof Error?error.name:"unknown",
        });
      }));
    }
  },
};
