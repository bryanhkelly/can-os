import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {AuthorizationError} from "@/domain/command-context";
import {getRequest} from "@tanstack/react-start/server";

type Sender = {id:string;sender_from:string;postal_address:string;verification_reference:string};
export async function readCampaignSenderRegistryState(){
 const result=await db.execute(sql`SELECT id,sender_from,postal_address,verification_reference,revoked_at FROM public.communication_sender_versions WHERE purpose='campaign' ORDER BY (revoked_at IS NULL) DESC,approved_at DESC,id DESC LIMIT 1`);
 const latest=result.rows[0] as (Sender & {revoked_at:unknown})|undefined;
 return {configured:!!latest,active:latest&&!latest.revoked_at?{id:latest.id,sender_from:latest.sender_from,postal_address:latest.postal_address,verification_reference:latest.verification_reference}:null};
}
export async function readCampaignSenderRegistry(){return (await readCampaignSenderRegistryState()).active;}
async function owner(){
 const actor=await requireReportingPlatformAdministrator(getRequest());
 if(actor.role!=="platform_owner")throw new AuthorizationError("platform owner sender approval");
 return actor;
}
export async function readSenderAdministration(){await owner();return readCampaignSenderRegistry();}
export async function changeSenderAdministration(data:{from:string;address:string;reference:string;expectedId:string|null}){
 const actor=await owner();
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('communication-sender-campaign',0))`);
  const current=await tx.execute(sql`SELECT id FROM public.communication_sender_versions WHERE purpose='campaign' AND revoked_at IS NULL`);
  if((current.rows[0]?.id??null)!==data.expectedId)throw new Error("Sender configuration changed. Refresh before approving.");
  await tx.execute(sql`UPDATE public.communication_sender_versions SET revoked_at=now(),revoked_by_person_id=${actor.actorPersonId} WHERE purpose='campaign' AND revoked_at IS NULL`);
  await tx.execute(sql`INSERT INTO public.communication_sender_versions(purpose,sender_from,postal_address,verification_reference,approved_by_person_id)
  VALUES('campaign',${data.from},${data.address},${data.reference},${actor.actorPersonId})`);
  return {ok:true};
 });
}

export async function revokeSenderAdministration(data:{expectedId:string;confirmed:true}){
 const actor=await owner();
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('communication-sender-campaign',0))`);
  const result=await tx.execute(sql`UPDATE public.communication_sender_versions SET revoked_at=now(),revoked_by_person_id=${actor.actorPersonId} WHERE purpose='campaign' AND id=${data.expectedId} AND revoked_at IS NULL RETURNING id`);
  if(!result.rows.length)throw new Error("Sender configuration changed. Refresh before revoking.");
  return {ok:true};
 });
}
