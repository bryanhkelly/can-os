import { and,eq,isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { personProfileDetails,sitePublications,sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  projectConsentedPublicSitePerson,publicBioSignature,
  readPublicBioConsent,readPublicStaffApprovals,publicStaffApprovalsSchema,
  type PublicSitePerson,
} from "@/domain/public-site-people";
import { writeAudit } from "@/platform/mutation";
import { requireSitePublisher } from "./site-publication.server";
import { assertActiveSiteStaffPerson } from "./site-public-people-consent.server";

/** Site publisher approves exact self-consented content, not an employment record. */
export async function approvePublicSitePeople(actor:AccessContext,input:{
  siteId:string;personIds:string[];expectedRevision:number;
  reviewed:true;reason:string;
}) {
  if(!input.reviewed || input.reason.trim().length<10 ||
    input.reason.trim().length>500 || input.personIds.length>20 ||
    new Set(input.personIds).size!==input.personIds.length)
    throw new Error("Choose unique consented people and record a review reason");
  return db.transaction(async tx=>{
    const site=await requireSitePublisher(actor,input.siteId,tx);
    const [record]=await tx.select({metadata:sites.metadata}).from(sites)
      .where(eq(sites.id,site.id)).for("update").limit(1);
    if(!record)throw new Error("Site not found");
    const previous=readPublicStaffApprovals(record.metadata);
    if((previous?.revision??0)!==input.expectedRevision)
      throw new Error("Public people approval changed. Refresh before saving.");
    const entries:Array<{personId:string;signature:string}>=[];
    for(const personId of input.personIds){
      await assertActiveSiteStaffPerson(personId,site.id,tx);
      const [detail]=await tx.select({metadata:personProfileDetails.metadata})
        .from(personProfileDetails)
        .where(eq(personProfileDetails.personId,personId))
        .for("share").limit(1);
      const consent=readPublicBioConsent(detail?.metadata??null,site.id);
      if(!consent)throw new Error("Every person must authorize their own current public biography");
      entries.push({personId,signature:publicBioSignature(consent)});
    }
    if(!actor.actorPersonId)throw new Error("Publisher identity required");
    const approved=publicStaffApprovalsSchema.parse({
      version:1,revision:(previous?.revision??0)+1,
      approvedByPersonId:actor.actorPersonId,approvedAt:new Date().toISOString(),entries,
    });
    await tx.update(sites).set({
      metadata:{...record.metadata,publicStaffApprovals:approved},
      updatedAt:new Date(),
    }).where(eq(sites.id,site.id));
    await writeAudit(tx,actor,{
      action:"site.public_people.review",
      entityType:"site",entityId:site.id,
      scope:{organizationId:site.organizationId,siteId:site.id},
      before:{revision:previous?.revision??0},
      after:{revision:approved.revision,peopleCount:entries.length,reason:input.reason},
    });
    return {revision:approved.revision,count:entries.length};
  });
}

/**
 * Anonymous-safe minimal identity subset. Reads only explicitly opted-in,
 * institutionally approved, currently assigned staff. No photo, person ID,
 * personal contact details, compliance records, student identities, or roster.
 */
export async function readApprovedPublicSitePeople(
  siteId:string,executor:Pick<typeof db,"select">=db,
  now=new Date(),
):Promise<PublicSitePerson[]> {
  const [record]=await executor.select({metadata:sites.metadata})
    .from(sites).innerJoin(sitePublications,eq(sitePublications.siteId,sites.id))
    .where(and(eq(sites.id,siteId),
      eq(sitePublications.status,"published"),
      isNotNull(sitePublications.publishedAt)))
    .for("share",{of:[sites,sitePublications]}).limit(1);
  if(!record)return [];
  const approval=readPublicStaffApprovals(record.metadata);
  if(!approval)return [];
  const people:PublicSitePerson[]=[];
  for(const entry of approval.entries){
    try{
      await assertActiveSiteStaffPerson(entry.personId,siteId,executor);
    }catch{continue}
    const [detail]=await executor.select({metadata:personProfileDetails.metadata})
      .from(personProfileDetails)
      .where(eq(personProfileDetails.personId,entry.personId))
      .for("share",{of:personProfileDetails}).limit(1);
    const consent=readPublicBioConsent(detail?.metadata??null,siteId,now);
    const publicPerson=projectConsentedPublicSitePerson(consent,entry);
    if(publicPerson)people.push(publicPerson);
  }
  return people;
}
