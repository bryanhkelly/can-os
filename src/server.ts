import handler from "@tanstack/react-start/server-entry";
import type {PhotoWorkerEnv} from "./platform/photography/cloudflare-production.server";
import {withRequestDatabase} from "./db/client";
import {runSessionDeviceRetention} from "./workers/session-device-retention";
import {classifyCloudflareCron} from "./domain/cloudflare-cron-policy";
import { cloudflareIngressConfiguration, isCloudflareWorkerRuntime } from "./domain/worker-database-scope";
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
    const configured = cloudflareIngressConfiguration(
      isCloudflareWorkerRuntime(),
      Boolean(platform && typeof platform === "object" && "ACCESS_REQUEST_LIMIT" in platform),
      Boolean(platform && typeof platform === "object" && "ACCESS_VERIFY_LIMIT" in platform),
    );
    if (configured === "misconfigured_worker") {
      // Never bypass the trusted ingress, rate limiting or request DB scope.
      return new Response("Service unavailable", {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
    if (configured === "cloudflare") {
      const worker=await import("./cloudflare-demo");
      return worker.default.fetch(request,
        platform as Parameters<typeof worker.default.fetch>[1]);
    }
    return handler.fetch(request);
  },
  scheduled(event:{cron?:string},env:CloudflareScheduledEnv,ctx:{waitUntil(task:Promise<unknown>):void}):void {
    const task=classifyCloudflareCron(event.cron);
    // The photo pipeline uses R2 and does not touch Neon; keep its minute tick.
    if(task==="photography"){
      ctx.waitUntil(import("./platform/photography/cloudflare-production.server")
        .then(({runBoundTemplatePhotoProduction})=>runBoundTemplatePhotoProduction(env))
        .then(result=>console.info("CAN photography cron result",result))
        .catch(error=>console.error("CAN photography cron failed",{
          type:error instanceof Error?error.name:"unknown",
          message:error instanceof Error?error.message.slice(0,130):"unknown",
        })));
    }
    // Every 15 minutes, not every minute. The existing durable database
    // leases and provider receipts preserve idempotency with Netlify's
    // scheduled maintenance runner, which uses the same cadence.
    if(task==="deliveries" && env.DATABASE_URL){
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
      ctx.waitUntil(withRequestDatabase(
        async()=>{
          const {processClassParticipantDeliveries}=await import(
            "./modules/classes/class-participant-delivery.server"
          );
          return processClassParticipantDeliveries();
        },
        env.DATABASE_URL,
      ).then(result=>{
        if(result.accepted||result.failed||result.suppressed)
          console.info("CAN Class participant delivery dispatch",result);
      }).catch(error=>{
        console.error("CAN Class participant delivery dispatch failed",{
          type:error instanceof Error?error.name:"unknown",
        });
      }));
    }
    // One daily attempt is enough: the existing transactional lease still
    // enforces once-per-day cleanup. Never open Neon on the photo-only tick.
    if(task==="retention" && env.DATABASE_URL &&
      env.CAN_SESSION_DEVICE_RETENTION_ENABLED==="1"){
      ctx.waitUntil(withRequestDatabase(
        () => runSessionDeviceRetention(true),
        env.DATABASE_URL,
      ).then(executed=>{
        if(executed)console.info("CAN session metadata retention completed");
      }).catch(error=>{
        console.error("CAN session metadata retention failed",{
          type:error instanceof Error?error.name:"unknown",
        });
      }));
    }
  },
};
