import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {AuthorizationError} from "@/domain/command-context";
import {DomainError} from "@/domain/errors";

import {readCampaignSenderRegistry} from "./campaign-sender-state.server";
export {readCampaignSenderRegistryState,readCampaignSenderRegistry} from "./campaign-sender-state.server";
async function owner(request:Request){
 const actor=await requireReportingPlatformAdministrator(request);
 if(actor.role!=="platform_owner")throw new AuthorizationError("platform owner sender approval");
 return actor;
}
export async function readSenderAdministration(request:Request,organizationId:string|null=null){await owner(request);return readCampaignSenderRegistry(organizationId);}
export async function listSenderOrganizations(request:Request){await owner(request);const result=await db.execute(sql`SELECT id,name FROM public.organizations ORDER BY name,id`);return result.rows as {id:string;name:string}[];}
export async function changeSenderAdministration(request:Request,data:{from:string;address:string;reference:string;expectedId:string|null;organizationId?:string|null}){
 const actor=await owner(request);
 const organizationId=data.organizationId??null;
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'communication-sender-campaign:'+ (organizationId??'platform')},0))`);
  const current=await tx.execute(sql`SELECT id FROM public.communication_sender_versions WHERE purpose='campaign' AND organization_id IS NOT DISTINCT FROM ${organizationId}::uuid AND revoked_at IS NULL`);
  if((current.rows[0]?.id??null)!==data.expectedId)throw new DomainError("CONFLICT","Sender configuration changed. Refresh before approving.");
  await tx.execute(sql`UPDATE public.communication_sender_versions SET revoked_at=now(),revoked_by_person_id=${actor.actorPersonId} WHERE purpose='campaign' AND organization_id IS NOT DISTINCT FROM ${organizationId}::uuid AND revoked_at IS NULL`);
  await tx.execute(sql`INSERT INTO public.communication_sender_versions(organization_id,purpose,sender_from,postal_address,verification_reference,approved_by_person_id)
  VALUES(${organizationId},'campaign',${data.from},${data.address},${data.reference},${actor.actorPersonId})`);
  return {ok:true};
 });
}

export async function revokeSenderAdministration(request:Request,data:{expectedId:string;confirmed:true;organizationId?:string|null}){
 const actor=await owner(request);
 const organizationId=data.organizationId??null;
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'communication-sender-campaign:'+ (organizationId??'platform')},0))`);
  const result=await tx.execute(sql`UPDATE public.communication_sender_versions SET revoked_at=now(),revoked_by_person_id=${actor.actorPersonId} WHERE purpose='campaign' AND organization_id IS NOT DISTINCT FROM ${organizationId}::uuid AND id=${data.expectedId} AND revoked_at IS NULL RETURNING id`);
  if(!result.rows.length)throw new DomainError("CONFLICT","Sender configuration changed. Refresh before revoking.");
  return {ok:true};
 });
}

/** New HTTP consumers use bounded keyset discovery. Legacy picker retains its exact shape until cutover. */
export async function listSenderOrganizationsPage(request:Request,data:{limit:number;afterName?:string;afterId?:string}){
 await owner(request);
 const boundary=data.afterName!==undefined&&data.afterId!==undefined
   ?sql`WHERE (name,id) > (${data.afterName},${data.afterId}::uuid)`:sql``;
 const result=await db.execute(sql`SELECT id,name FROM public.organizations ${boundary} ORDER BY name,id LIMIT ${data.limit+1}`);
 const rows=result.rows as {id:string;name:string}[];
 const items=rows.slice(0,data.limit);
 const last=items.at(-1);
 return {items,nextCursor:rows.length>data.limit&&last?{afterName:last.name,afterId:last.id}:null};
}
