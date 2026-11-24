import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import type {AccessContext} from "@/domain/access-context";
import type {CampaignDeliveryMetrics} from "@/domain/campaign-metrics";
import {loadAuthorizedSiteReportingScope} from "@/modules/insights/site-reporting-source-scope.server";

/** Static, shared aggregate projection. Caller supplies only server-verified
 * ownership filters. Never expose addresses, subject, body or tracking tokens. */
export const campaignDeliveryCountColumns=sql`
 count(d.id)::int total,count(d.id) FILTER(WHERE d.status IN ('pending','processing'))::int pending,
 count(d.id) FILTER(WHERE d.accepted_at IS NOT NULL)::int accepted,
 count(d.id) FILTER(WHERE d.delivered_at IS NOT NULL AND d.provider_failure IS NULL)::int delivered,
 count(d.id) FILTER(WHERE d.provider_failure='email.bounced')::int bounced,
 count(d.id) FILTER(WHERE d.provider_failure='email.complained')::int complained,
 count(d.id) FILTER(WHERE (d.status='failed' AND NOT d.outcome_unconfirmed) OR d.provider_failure='email.failed')::int failed,
 count(d.id) FILTER(WHERE d.status='failed' AND d.outcome_unconfirmed)::int unconfirmed,
 count(d.id) FILTER(WHERE d.status='suppressed' OR d.provider_failure='email.suppressed')::int suppressed,
 count(d.id) FILTER(WHERE d.status='cancelled')::int cancelled
`;
export async function readSiteCampaignDeliveryMetrics(actor:AccessContext,input:{siteId:string;from:string;to:string}){
 const from=new Date(input.from),to=new Date(input.to),asOf=new Date();
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||to>asOf||to.getTime()-from.getTime()>90*86400000)
  throw new Error("Campaign reporting requires a closed positive period of at most 90 days");
 return db.transaction(async tx=>{
  const site=await loadAuthorizedSiteReportingScope(tx,actor,input.siteId);
  const result=await tx.execute(sql`SELECT ${campaignDeliveryCountColumns}
   FROM public.engagement_campaigns c JOIN public.engagement_definitions e ON e.id=c.engagement_id
   JOIN public.campaign_deliveries d ON d.campaign_id=c.id AND d.owner_scope=c.owner_scope
   WHERE e.organization_id=${site.organizationId} AND e.site_id=${site.id}
   AND c.sender_scope='organization:'||e.organization_id::text
   AND ((e.owner_kind='site' AND e.program_id IS NULL AND c.owner_scope='site:'||e.site_id::text)
     OR (e.owner_kind='program' AND c.owner_scope='program:'||e.program_id::text AND EXISTS(
       SELECT 1 FROM public.programs p WHERE p.id=e.program_id AND p.site_id=e.site_id AND p.organization_id=e.organization_id)))
   AND c.created_at>=${from.toISOString()}::timestamptz AND c.created_at<${to.toISOString()}::timestamptz`);
  const counts=result.rows[0] as unknown as CampaignDeliveryMetrics|undefined;
  if(!counts)throw new Error("Campaign aggregate unavailable");
  return {siteId:site.id,from:from.toISOString(),to:to.toISOString(),asOf:asOf.toISOString(),timeBasis:"campaign_creation_cohort_current_state" as const,counts,uniquePeople:null,conversionAttribution:null,includesOrganizationOwnedCampaigns:false};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
