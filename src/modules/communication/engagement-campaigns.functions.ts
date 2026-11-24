import {EventTypes} from "@/domain/event-types";
import {emitReportableChange} from "@/platform/reportable-event";
import {campaignDeliveryCountColumns} from "@/modules/insights/campaign-delivery-metrics.server";
import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {sql,eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {accessAccounts,organizations} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {authorizeEngagementDistribution,readAuthorizedEngagementInvitation} from "@/modules/engagement/engagement-registry.functions";
import {isDemoTenantOrganization} from "@/modules/identity/demo-school-tenants.server";
import {isDemoAccountEmail} from "@/domain/local-demo-access";
import {campaignOwnerScope,parseCampaignRecipients,campaignRecipientLimit} from "@/domain/campaign-policy";
import {campaignRows,campaignSender} from "./campaign-store.server";
const uuid=z.string().uuid();
const input=z.object({engagementId:uuid,linkId:uuid}).strict();
async function scope(engagementId:string){
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 const record=await authorizeEngagementDistribution(engagementId,actor);
 const [account]=await db.select({email:accessAccounts.emailNormalized}).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
 if(!account||isDemoAccountEmail(account.email)||await isDemoTenantOrganization(record.organizationId))throw new Error("Native distribution requires a real authorized tenant and operator.");
 const organization=record.organizationId?(await db.select({name:organizations.name}).from(organizations).where(eq(organizations.id,record.organizationId)).limit(1))[0]:null;
 if(record.organizationId&&!organization)throw new Error("Organization unavailable.");
 return {...campaignOwnerScope(record),actor,record,senderLabel:organization?.name??"Becomuna"};
}
type ListRow={id:string;name:string;recipients:number};
type CampaignRow={id:string;subject:string;scheduled_at:string;cancelled_at:string|null;total:number;pending:number;accepted:number;delivered:number;bounced:number;complained:number;failed:number;unconfirmed:number;suppressed:number;cancelled:number};
export const readEngagementCampaignWorkspace=createServerFn({method:"GET"})
 .validator((v:unknown)=>input.parse(v)).handler(async({data})=>{
 const s=await scope(data.engagementId);
 const lists=await campaignRows<ListRow>(db,sql`SELECT l.id,l.name,count(m.email)::int AS recipients
 FROM public.campaign_recipient_lists l LEFT JOIN public.campaign_list_members m ON m.list_id=l.id
 WHERE l.owner_scope=${s.ownerScope} GROUP BY l.id ORDER BY l.name LIMIT 100`);
 const campaigns=await campaignRows<CampaignRow>(db,sql`SELECT c.id,c.subject,c.scheduled_at,c.cancelled_at,
 ${campaignDeliveryCountColumns}
 FROM public.engagement_campaigns c JOIN public.campaign_deliveries d ON d.campaign_id=c.id
 WHERE c.owner_scope=${s.ownerScope} AND c.engagement_id=${data.engagementId} AND c.link_id=${data.linkId}
 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`);
 return {lists,campaigns,senderReady:!!campaignSender(),senderLabel:s.senderLabel};
 });
export const saveCampaignRecipientList=createServerFn({method:"POST"})
 .validator((v:unknown)=>input.extend({name:z.string().trim().min(1).max(120),raw:z.string().max(256000),
 consentSource:z.string().trim().min(5).max(500),attested:z.literal(true)}).strict().parse(v))
 .handler(async({data})=>{
 const s=await scope(data.engagementId);
 const parsed=parseCampaignRecipients(data.raw);
 if(!parsed.recipients.length||parsed.invalid.length||parsed.tooMany)throw new Error("Enter valid, consented addresses within the campaign limit.");
 return db.transaction(async tx=>{
 const [list]=await campaignRows<{id:string}>(tx,sql`INSERT INTO public.campaign_recipient_lists(owner_scope,sender_scope,name,created_by_person_id)
 VALUES(${s.ownerScope},${s.senderScope},${data.name},${s.actor.actorPersonId}) ON CONFLICT(owner_scope,name) DO UPDATE SET name=excluded.name RETURNING id`);
 const [count]=await campaignRows<{count:number}>(tx,sql`SELECT count(*)::int count FROM public.campaign_list_members WHERE list_id=${list.id} AND NOT(email=ANY(${sql`ARRAY[${sql.join(parsed.recipients.map(email=>sql`${email}`),sql`,`)}]::text[]`}))`);
 if((count?.count??0)+parsed.recipients.length>campaignRecipientLimit)throw new Error("List exceeds the current campaign limit.");
 const addresses=sql`ARRAY[${sql.join(parsed.recipients.map(email=>sql`${email}`),sql`,`)}]::text[]`;
 await tx.execute(sql`INSERT INTO public.campaign_contacts(owner_scope,email,consent_source,consent_by_person_id)
 SELECT ${s.ownerScope},email,${data.consentSource},${s.actor.actorPersonId}::uuid FROM unnest(${addresses}) AS entries(email)
 ON CONFLICT(owner_scope,email) DO NOTHING`);
 await tx.execute(sql`INSERT INTO public.campaign_list_members(owner_scope,list_id,email)
 SELECT ${s.ownerScope},${list.id}::uuid,email FROM unnest(${addresses}) AS entries(email) ON CONFLICT(list_id,email) DO NOTHING`);
 return {id:list.id};
 });
 });
export const queueEngagementCampaign=createServerFn({method:"POST"})
 .validator((v:unknown)=>input.extend({listId:uuid,requestId:uuid,scheduledAt:z.string().datetime(),confirmed:z.literal(true)}).strict().parse(v))
 .handler(async({data})=>{
 const s=await scope(data.engagementId);
 const sender=campaignSender();if(!sender)throw new Error("Campaign sender and postal address are not configured.");
 const draft=await readAuthorizedEngagementInvitation(data.engagementId,data.linkId,s.actor);
 const scheduledAt=new Date(data.scheduledAt);if(scheduledAt.getTime()>Date.now()+90*86400000)throw new Error("Schedule within 90 days.");
 return db.transaction(async tx=>{
 const [list]=await campaignRows<{id:string}>(tx,sql`SELECT id FROM public.campaign_recipient_lists WHERE id=${data.listId} AND owner_scope=${s.ownerScope} FOR UPDATE`);
 if(!list)throw new Error("Recipient list unavailable.");
 const [existing]=await campaignRows<{id:string;list_id:string;link_id:string;engagement_id:string}>(tx,sql`SELECT id,list_id,link_id,engagement_id FROM public.engagement_campaigns WHERE owner_scope=${s.ownerScope} AND request_id=${data.requestId}`);
 if(existing){if(existing.list_id!==data.listId||existing.link_id!==data.linkId||existing.engagement_id!==data.engagementId)throw new Error("Request already used.");return {id:existing.id};}
 const [campaign]=await campaignRows<{id:string}>(tx,sql`INSERT INTO public.engagement_campaigns(owner_scope,sender_scope,engagement_id,link_id,list_id,request_id,subject,body,public_url,sender_from,sender_address,created_by_person_id,scheduled_at)
 VALUES(${s.ownerScope},${s.senderScope},${data.engagementId},${data.linkId},${data.listId},${data.requestId},${draft.subject},${draft.body+"\n\nInvited by "+s.senderLabel},${draft.url},${sender.from},${sender.address},${s.actor.actorPersonId},${data.scheduledAt}::timestamptz) RETURNING id`);
 const inserted=await campaignRows<{id:string}>(tx,sql`INSERT INTO public.campaign_deliveries(owner_scope,campaign_id,email,status,next_attempt_at)
 SELECT m.owner_scope,${campaign.id},m.email,CASE WHEN s.email IS NULL THEN 'pending' ELSE 'suppressed' END,${data.scheduledAt}::timestamptz
 FROM public.campaign_list_members m LEFT JOIN public.campaign_suppressions s ON s.sender_scope=${s.senderScope} AND s.email=m.email
 WHERE m.owner_scope=${s.ownerScope} AND m.list_id=${list.id} RETURNING id`);
 if(!inserted.length||inserted.length>campaignRecipientLimit)throw new Error("Recipient list is empty or exceeds the campaign limit.");
 if(s.record.ownerKind==="site"&&s.record.siteId&&s.record.organizationId)
   await emitReportableChange(tx,{eventType:EventTypes.SiteCampaignQueued,sourceId:campaign.id,sourceVersion:"queued",occurredAt:new Date(),actorPersonId:s.actor.actorPersonId,dimensions:{organizationId:s.record.organizationId,siteId:s.record.siteId},payload:{engagementId:data.engagementId,linkId:data.linkId,recipientCount:inserted.length,scheduledAt:scheduledAt.toISOString()}});
 return {id:campaign.id};
 });
 });
export const cancelEngagementCampaign=createServerFn({method:"POST"})
 .validator((v:unknown)=>input.extend({campaignId:uuid}).strict().parse(v)).handler(async({data})=>{
 const s=await scope(data.engagementId);
 await db.transaction(async tx=>{
 const [cancelled]=await campaignRows<{id:string;cancelled_at:string|Date}>(tx,sql`UPDATE public.engagement_campaigns SET cancelled_at=now() WHERE id=${data.campaignId} AND owner_scope=${s.ownerScope} AND engagement_id=${data.engagementId} AND link_id=${data.linkId} AND cancelled_at IS NULL RETURNING id,cancelled_at`);
 if(cancelled&&s.record.ownerKind==="site"&&s.record.siteId&&s.record.organizationId)
   await emitReportableChange(tx,{eventType:EventTypes.SiteCampaignCancelled,sourceId:cancelled.id,sourceVersion:"cancelled",occurredAt:new Date(cancelled.cancelled_at),actorPersonId:s.actor.actorPersonId,dimensions:{organizationId:s.record.organizationId,siteId:s.record.siteId},payload:{engagementId:data.engagementId,linkId:data.linkId}});
 await tx.execute(sql`UPDATE public.campaign_deliveries d SET status='cancelled' FROM public.engagement_campaigns c WHERE d.campaign_id=c.id AND c.id=${data.campaignId} AND c.owner_scope=${s.ownerScope} AND c.engagement_id=${data.engagementId} AND c.link_id=${data.linkId} AND c.cancelled_at IS NOT NULL AND d.status='pending'`);
 });
 return {ok:true};
 });

type MemberRow={email:string;consent_source:string;consent_at:string;suppression:string|null};
export const readCampaignListMembers=createServerFn({method:"GET"})
 .validator((v:unknown)=>input.extend({listId:uuid,offset:z.number().int().min(0).max(1000)}).strict().parse(v))
 .handler(async({data})=>{
 const s=await scope(data.engagementId);
 const members=await campaignRows<MemberRow>(db,sql`SELECT p.email,p.consent_source,p.consent_at,s.reason AS suppression
 FROM public.campaign_recipient_lists l JOIN public.campaign_list_members m ON m.owner_scope=l.owner_scope AND m.list_id=l.id
 JOIN public.campaign_contacts p ON p.owner_scope=m.owner_scope AND p.email=m.email
 LEFT JOIN public.campaign_suppressions s ON s.sender_scope=l.sender_scope AND s.email=p.email
 WHERE l.id=${data.listId} AND l.owner_scope=${s.ownerScope} AND l.sender_scope=${s.senderScope}
 ORDER BY p.email LIMIT 51 OFFSET ${data.offset}`);
 return {members:members.slice(0,50),hasMore:members.length>50};
 });
export const updateCampaignListMember=createServerFn({method:"POST"})
 .validator((v:unknown)=>input.extend({listId:uuid,email:z.string().max(254),operation:z.enum(["remove","withdraw"]),confirmed:z.literal(true)}).strict().parse(v))
 .handler(async({data})=>{
 const s=await scope(data.engagementId);
 const parsed=parseCampaignRecipients(data.email);
 if(parsed.invalid.length||parsed.recipients.length!==1)throw new Error("Invalid member.");
 const email=parsed.recipients[0];
 return db.transaction(async tx=>{
 const [list]=await campaignRows<{id:string}>(tx,sql`SELECT id FROM public.campaign_recipient_lists WHERE id=${data.listId}
 AND owner_scope=${s.ownerScope} AND sender_scope=${s.senderScope} FOR UPDATE`);
 if(!list)throw new Error("Recipient list unavailable.");
 const [member]=await campaignRows<{email:string}>(tx,sql`SELECT email FROM public.campaign_list_members
 WHERE owner_scope=${s.ownerScope} AND list_id=${list.id} AND email=${email}`);
 if(!member)return {changed:false};
 if(data.operation==="withdraw"){
  await tx.execute(sql`INSERT INTO public.campaign_suppressions(sender_scope,email,reason,recorded_by_person_id)
  VALUES(${s.senderScope},${email},'unsubscribe',${s.actor.actorPersonId}) ON CONFLICT(sender_scope,email) DO NOTHING`);
  await tx.execute(sql`UPDATE public.campaign_deliveries d SET status='suppressed'
  FROM public.engagement_campaigns c WHERE c.id=d.campaign_id AND c.sender_scope=${s.senderScope}
  AND d.email=${email} AND d.status='pending'`);
 }else{
  await tx.execute(sql`DELETE FROM public.campaign_list_members WHERE owner_scope=${s.ownerScope} AND list_id=${list.id} AND email=${email}`);
  await tx.execute(sql`UPDATE public.campaign_deliveries d SET status='suppressed' FROM public.engagement_campaigns c
  WHERE c.id=d.campaign_id AND c.owner_scope=${s.ownerScope} AND c.list_id=${list.id} AND d.email=${email} AND d.status='pending'`);
 }
 return {changed:true};
 });
 });
