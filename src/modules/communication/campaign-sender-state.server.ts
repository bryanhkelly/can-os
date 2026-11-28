// Provider readiness reads have no framework request dependency.
import {sql} from "drizzle-orm";
import {db} from "@/db/client";
type Sender = {id:string;sender_from:string;postal_address:string;verification_reference:string};
export async function readCampaignSenderRegistryState(organizationId:string|null=null){
 const result=await db.execute(sql`SELECT id,sender_from,postal_address,verification_reference,revoked_at FROM public.communication_sender_versions WHERE purpose='campaign' AND organization_id IS NOT DISTINCT FROM ${organizationId}::uuid ORDER BY (revoked_at IS NULL) DESC,approved_at DESC,id DESC LIMIT 1`);
 const latest=result.rows[0] as (Sender & {revoked_at:unknown})|undefined;
 return {configured:!!latest,active:latest&&!latest.revoked_at?{id:latest.id,sender_from:latest.sender_from,postal_address:latest.postal_address,verification_reference:latest.verification_reference}:null};
}
export async function readCampaignSenderRegistry(organizationId:string|null=null){return (await readCampaignSenderRegistryState(organizationId)).active;}
