import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {db} from "@/db/client";
import {writeAudit} from "@/platform/mutation";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {readReportingProjectionHealth} from "./reporting-projection-health.server";
import {replayReportingSourceReceipts} from "./reporting-source-receipts.server";
export const getReportingProjectionHealth=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 await requireReportingPlatformAdministrator(getRequest());
 return readReportingProjectionHealth();
});
export const replayReportingProjectionBatch=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({confirmed:z.literal(true)}).strict().parse(value))
 .handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await requireReportingPlatformAdministrator(getRequest());
  const health=await readReportingProjectionHealth();
  if(!health.enabled||!health.storageReady)throw new Error("Reporting projection is not activated or storage is unavailable.");
  // Audit the actual operator before executing the bounded, idempotent worker.
  await db.transaction(tx=>writeAudit(tx,actor,{action:"reporting.projection.replay_requested",entityType:"platform_reporting",entityId:actor.actorPersonId!,after:{limit:50}}));
  const result=await replayReportingSourceReceipts(50);
  return {result,health:await readReportingProjectionHealth()};
 });
