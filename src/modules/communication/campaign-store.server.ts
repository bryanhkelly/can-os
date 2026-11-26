import { submitResendEmail } from "@/modules/communication/resend-email-transport.server";
import {sql,type SQL} from "drizzle-orm";
import {db} from "@/db/client";
import {resolveGoExperience} from "@/modules/engagement/engagement-go.server";
import {suppressDemoEmailDelivery} from "@/domain/email-delivery-policy";
import {OUTBOUND_LEASE_MS,outboundRetryDelayMs} from "@/domain/outbound-retry-policy";
import { campaignRetryable, parseCampaignRecipients, campaignRetryAfterMs, campaignMaxAttempts, campaignRetryWindowMs, campaignProviderFailure } from "@/domain/campaign-policy";
import type {ResendReceiptEvent} from "@/domain/resend-webhook";

type Executor=Pick<typeof db,"execute">;
export async function campaignRows<T>(executor:Executor,query:SQL):Promise<T[]>{
 const result=await executor.execute(query);
 return result.rows as unknown as T[];
}
export function campaignSender(){
 const from=process.env.CAN_CAMPAIGN_FROM_EMAIL?.trim();
 const address=process.env.CAN_CAMPAIGN_POSTAL_ADDRESS?.trim();
 const key=process.env.RESEND_API_KEY;
 const origin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!from||!address||!key||!origin||!process.env.RESEND_WEBHOOK_SECRET||/[\r\n]/.test(from)||address.length>500)return null;
 try{const url=new URL(origin);if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||url.username||url.password)return null;}catch{return null;}
 return {from,address,key,origin};
}
type Work = {
  id: string;
  lease_id: string;
  email: string;
  unsubscribe_token: string;
  attempts: number;
  first_attempt_at: string;
  subject: string;
  body: string;
  public_url: string;
  sender_from: string;
  sender_address: string;
  code: string;
};
async function claimCampaignDelivery(){
 return db.transaction(async tx=>{
 // Expired ambiguous attempts are never retried outside the provider's idempotency window.
 await tx.execute(sql`UPDATE public.campaign_deliveries d SET status=CASE WHEN d.outcome_unconfirmed OR d.status='processing' THEN 'failed' ELSE 'cancelled' END,
 outcome_unconfirmed=d.outcome_unconfirmed OR d.status='processing',lease_id=NULL,lease_until=NULL
 FROM public.engagement_campaigns c WHERE c.id=d.campaign_id AND c.cancelled_at IS NOT NULL
 AND (d.status='pending' OR (d.status='processing' AND d.lease_until<now()))`);
 await tx.execute(sql`UPDATE public.campaign_deliveries SET status='failed',outcome_unconfirmed=outcome_unconfirmed OR status='processing',lease_id=NULL,lease_until=NULL
 WHERE status IN ('pending','processing') AND (lease_until IS NULL OR lease_until<now())
 AND (attempts>=${campaignMaxAttempts} OR first_attempt_at<now()-(${campaignRetryWindowMs} * interval '1 millisecond'))`);
 const [row]=await campaignRows<Work>(tx,sql`
 WITH candidate AS (
  SELECT d.id FROM public.campaign_deliveries d JOIN public.engagement_campaigns c ON c.id=d.campaign_id
  WHERE c.scheduled_at<=now() AND c.cancelled_at IS NULL AND d.next_attempt_at<=now()
  AND (d.status='pending' OR (d.status='processing' AND d.lease_until<now()))
  AND d.attempts<${campaignMaxAttempts} AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-(${campaignRetryWindowMs} * interval '1 millisecond'))
  ORDER BY d.next_attempt_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
 ), claimed AS (
  UPDATE public.campaign_deliveries d SET status='processing',lease_id=gen_random_uuid(),
   lease_until=now()+(${OUTBOUND_LEASE_MS} * interval '1 millisecond'),attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),
   outcome_unconfirmed=outcome_unconfirmed OR status='processing'
  FROM candidate WHERE d.id=candidate.id
  RETURNING d.id,d.lease_id,d.email,d.unsubscribe_token,d.attempts,d.first_attempt_at,d.campaign_id
 )
 SELECT d.id,d.lease_id,d.email,d.unsubscribe_token,d.attempts,d.first_attempt_at,
  c.subject,c.body,c.public_url,c.sender_from,c.sender_address,l.code
 FROM claimed d JOIN public.engagement_campaigns c ON c.id=d.campaign_id
 JOIN public.engagement_definitions e ON e.id=c.engagement_id JOIN public.site_go_links l ON l.id=c.link_id`);
 return row;
 });
}
async function settle(work:Work,status:string,providerId:string|null=null,unconfirmed=false,delayMs=outboundRetryDelayMs(work.attempts)){
 const rows=await campaignRows<{id:string;status:string;outcome_unconfirmed:boolean}>(db,sql`UPDATE public.campaign_deliveries SET status=CASE WHEN ${status}='pending' AND EXISTS(SELECT 1 FROM public.engagement_campaigns c WHERE c.id=campaign_deliveries.campaign_id AND c.cancelled_at IS NOT NULL)
 THEN CASE WHEN outcome_unconfirmed OR ${unconfirmed} THEN 'failed' ELSE 'cancelled' END
 WHEN ${status} IN ('suppressed','failed','cancelled') AND (outcome_unconfirmed OR ${unconfirmed}) THEN 'failed' ELSE ${status} END,
 outcome_unconfirmed=CASE WHEN ${status}='accepted' THEN false ELSE outcome_unconfirmed OR ${unconfirmed} END,lease_id=NULL,lease_until=NULL,
 next_attempt_at=now()+(${delayMs} * interval '1 millisecond'),
 provider_message_id=coalesce(provider_message_id,${providerId}),
 accepted_at=CASE WHEN ${status}='accepted' THEN coalesce(accepted_at,now()) ELSE accepted_at END
 WHERE id=${work.id} AND lease_id=${work.lease_id} AND status='processing' RETURNING id,status,outcome_unconfirmed`);
 return rows[0]??null;
}
async function stillEligible(work:Work){
 const [row]=await campaignRows<{eligible:boolean}>(db,sql`SELECT EXISTS(
 SELECT 1 FROM public.campaign_deliveries d JOIN public.engagement_campaigns c ON c.id=d.campaign_id
 JOIN public.campaign_contacts p ON p.owner_scope=d.owner_scope AND p.email=d.email
 JOIN public.campaign_list_members m ON m.owner_scope=d.owner_scope AND m.email=d.email AND m.list_id=c.list_id
 WHERE d.id=${work.id} AND d.lease_id=${work.lease_id} AND d.status='processing' AND d.lease_until>now()
 AND c.cancelled_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.campaign_suppressions s WHERE s.sender_scope=c.sender_scope AND s.email=d.email)
 ) AS eligible`);
 return row?.eligible===true;
}
/** Both schedulers use this exact queue. One message per recipient; never BCC bulk mail. */
export async function processEngagementCampaignDeliveries(limit=10){
 const counts={accepted:0,failed:0,suppressed:0,retry:0,unconfirmed:0};
 const sender=campaignSender();if(!sender)return counts;
 function countSettled(row:Awaited<ReturnType<typeof settle>>){
  if(!row)return;
  if(row.status==="accepted")counts.accepted++;
  else if(row.status==="pending")counts.retry++;
  else if(row.status==="suppressed")counts.suppressed++;
  else if(row.status==="failed")counts[row.outcome_unconfirmed?"unconfirmed":"failed"]++;
 }
 for(let i=0;i<Math.min(10,limit);i++){
  const work=await claimCampaignDelivery();if(!work)break;
  let transportStarted=false;
  try{
   const parsed=parseCampaignRecipients(work.email);
   const url=new URL(work.public_url);
   if(parsed.invalid.length||parsed.recipients.length!==1||work.sender_from!==sender.from||work.sender_address!==sender.address||
     url.origin!==new URL(sender.origin).origin||url.pathname!=="/go/"+work.code||url.search||url.hash||
     suppressDemoEmailDelivery(work.email)){
    countSettled(await settle(work,"suppressed"));continue;
   }
   const experience=await resolveGoExperience(work.code,"/",false);
   if(!experience||experience.mode==="website-preview"||!await stillEligible(work)){
    countSettled(await settle(work,"suppressed"));continue;
   }
   const unsubscribe=new URL("/api/campaigns/unsubscribe",sender.origin);
   unsubscribe.searchParams.set("token",work.unsubscribe_token);
   transportStarted=true;
   const response=await submitResendEmail({from:sender.from,to:[work.email],subject:work.subject,
     text:work.body+"\n\nSent by "+sender.from+"\n"+sender.address+"\nUnsubscribe: "+unsubscribe.href,
     headers:{"List-Unsubscribe":"<"+unsubscribe.href+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"},
     tags:[{name:"can_source",value:"engagement_campaign"},{name:"can_receipt",value:work.id}]},
     sender.key,"engagement-campaign/"+work.id);
   if(response.ok){
    const result=await response.json() as {id?:unknown};
    if(typeof result.id!=="string"||!result.id)throw new Error("missing provider receipt");
    countSettled(await settle(work,"accepted",result.id));continue;
   }
   const failure = campaignProviderFailure(response.status);
   if (failure.retryable) {
    const retry=campaignRetryable(work.attempts,work.first_attempt_at);
    const delay=Math.max(outboundRetryDelayMs(work.attempts),campaignRetryAfterMs(response.headers.get("retry-after")));
    // 429 is a definite rejection of this attempt, but cannot erase earlier uncertainty.
    countSettled(await settle(work, retry ? "pending" : "failed", null, failure.outcomeUnconfirmed, delay));
    if (failure.stopBatch) break;
    continue;
   }
   countSettled(await settle(work,"failed"));
  }catch{
   const retry=campaignRetryable(work.attempts,work.first_attempt_at);
   countSettled(await settle(work,retry?"pending":"failed",null,transportStarted));
  }
 }
 return counts;
}
export async function suppressCampaignRecipient(token:string){
 await db.transaction(async tx=>{
  await tx.execute(sql`INSERT INTO public.campaign_suppressions(sender_scope,email,reason)
   SELECT c.sender_scope,d.email,'unsubscribe' FROM public.campaign_deliveries d
   JOIN public.engagement_campaigns c ON c.id=d.campaign_id WHERE d.unsubscribe_token=${token}
   ON CONFLICT(sender_scope,email) DO NOTHING`);
  await tx.execute(sql`UPDATE public.campaign_deliveries d SET status=CASE WHEN d.outcome_unconfirmed THEN 'failed' ELSE 'suppressed' END FROM public.engagement_campaigns c
   WHERE c.id=d.campaign_id AND d.status='pending' AND EXISTS(
   SELECT 1 FROM public.campaign_deliveries target JOIN public.engagement_campaigns source ON source.id=target.campaign_id
   WHERE target.unsubscribe_token=${token} AND target.email=d.email AND source.sender_scope=c.sender_scope)`);
 });
}
export async function attachCampaignProviderReceipt(event:ResendReceiptEvent){
 await db.transaction(async tx=>{
 const [match]=await campaignRows<{email:string;sender_scope:string}>(tx,sql`
 WITH updated AS (
 UPDATE public.campaign_deliveries SET status='accepted',outcome_unconfirmed=false,accepted_at=coalesce(accepted_at,now()),
 provider_message_id=${event.providerMessageId},lease_id=NULL,lease_until=NULL,
 delivered_at=CASE WHEN ${event.type}='email.delivered' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
 provider_failure=CASE WHEN ${event.type}='email.delivered' OR provider_failure='email.complained' THEN provider_failure
 WHEN provider_failure='email.bounced' AND ${event.type}<>'email.complained' THEN provider_failure ELSE ${event.type} END
 WHERE id=${event.receiptId} AND first_attempt_at IS NOT NULL
 AND (provider_message_id IS NULL OR provider_message_id=${event.providerMessageId}) RETURNING campaign_id,email
 ) SELECT u.email,c.sender_scope FROM updated u JOIN public.engagement_campaigns c ON c.id=u.campaign_id`);
 if(!match)return;
 const reason=event.type==="email.bounced"?"bounce":event.type==="email.complained"?"complaint":event.type==="email.suppressed"?"provider_suppression":null;
 if(reason)await tx.execute(sql`INSERT INTO public.campaign_suppressions(sender_scope,email,reason)
 VALUES(${match.sender_scope},${match.email},${reason}) ON CONFLICT(sender_scope,email) DO NOTHING`);
 });
}
