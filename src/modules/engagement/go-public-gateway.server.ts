import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteGoLinks, siteGoLinkDailyVisits } from "@/db/schema";
import { goCodeSchema } from "@/domain/site-go-links";
import { goResponseCounts, type GoResponseKind } from "@/domain/go-response-observation";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The role and exact-code GUC are transaction-local. Never fall back to
 * owner access for the registry, and never expose this transaction to callers. */
async function withGoCode<T>(code:string,run:(tx:Tx)=>Promise<T>):Promise<T>{
  goCodeSchema.parse(code);
  return db.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL ROLE can_go_gateway`);
    await tx.execute(sql`SELECT set_config('can.go_code',${code},true)`);
    return run(tx);
  });
}

export async function readPublicGoLink(code:string){
  if(!goCodeSchema.safeParse(code).success)return null;
  return withGoCode(code,async tx=>{
    const [link]=await tx.select({
      id:siteGoLinks.id,startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
      destination:siteGoLinks.destination,status:siteGoLinks.status,
      siteId:siteGoLinks.siteId,organizationId:siteGoLinks.organizationId,
      packageId:siteGoLinks.packageId,engagementVersionId:siteGoLinks.engagementVersionId,
    }).from(siteGoLinks).where(eq(siteGoLinks.code,code)).limit(1);
    return link??null;
  });
}
export type PublicGoLink=NonNullable<Awaited<ReturnType<typeof readPublicGoLink>>>;

/** Anonymous aggregate only. Failure cannot block a valid destination. */
export async function observePublicGoResponse(code:string,linkId:string,response:GoResponseKind,entry=true):Promise<void>{
  const {linkOpens:opens,pageViews:views,redirectResponses:redirects}=goResponseCounts(response,entry);
  try{
    await withGoCode(code,async tx=>{
      await tx.insert(siteGoLinkDailyVisits).values({
        linkId,day:sql`(now() AT TIME ZONE 'UTC')::date`,redirects:opens,
        linkOpens:opens,pageViews:views,redirectResponses:redirects,
      }).onConflictDoUpdate({
        target:[siteGoLinkDailyVisits.linkId,siteGoLinkDailyVisits.day],
        set:{redirects:sql`${siteGoLinkDailyVisits.redirects}+${opens}`,
          linkOpens:sql`${siteGoLinkDailyVisits.linkOpens}+${opens}`,
          pageViews:sql`${siteGoLinkDailyVisits.pageViews}+${views}`,
          redirectResponses:sql`${siteGoLinkDailyVisits.redirectResponses}+${redirects}`},
      });
    });
  }catch{
    console.error("Go Link aggregate observation unavailable",{kind:"daily_counter"});
  }
}
