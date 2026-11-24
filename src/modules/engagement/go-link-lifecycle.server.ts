import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { siteGoLinks } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import { goLinkStatusTransition } from "@/domain/go-link-policy";
import { goDestinationSchema } from "@/domain/site-go-links";
import { writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Link = typeof siteGoLinks.$inferSelect;
type Scope = { id:string; organizationId:string };
type OwnerScope = {siteId:string|null;organizationId:string|null};
type Issuance = Omit<typeof siteGoLinks.$inferInsert,"code"|"id"|"siteId"|"organizationId"|"createdByPersonId">;

/** Internal only: caller must authorize the exact Site and destination first.
 * A request fingerprint describes caller intent, not a generated artifact ID. */
export function goRequestFingerprint(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function findGoIssuance(tx:Tx,actor:AccessContext,site:Scope,requestId:string,fingerprint:string):Promise<Link|undefined>{
  if(!actor.actorPersonId)throw new DomainError("FORBIDDEN");
  const key=[site.id,actor.actorPersonId,requestId].join(":");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  const [prior]=await tx.select().from(siteGoLinks).where(and(
    eq(siteGoLinks.siteId,site.id),eq(siteGoLinks.organizationId,site.organizationId),
    eq(siteGoLinks.createdByPersonId,actor.actorPersonId),eq(siteGoLinks.requestId,requestId),
  )).limit(1);
  if(prior && prior.requestFingerprint!==fingerprint)throw new DomainError("CONFLICT","Request ID already used for another link.");
  return prior;
}
/** One collision-safe allocation path for both resolution modes.
 * Callers must validate ownership and destination before invoking this private helper. */
async function allocateGoLink(tx:Tx,actor:AccessContext,scope:OwnerScope,input:Issuance):Promise<Link>{
  if(!actor.actorPersonId||actor.delegationMode==="view")throw new DomainError("FORBIDDEN");
  for(let attempt=0;attempt<5;attempt++){
    const [created]=await tx.insert(siteGoLinks).values({
      ...input,code:randomBytes(9).toString("base64url"),siteId:scope.siteId,
      organizationId:scope.organizationId,createdByPersonId:actor.actorPersonId,
    }).onConflictDoNothing({target:siteGoLinks.code}).returning();
    if(created)return created;
  }
  throw new DomainError("CONFLICT","Unable to issue a unique Go link.");
}

export async function issueAuthorizedGoLink(tx:Tx,actor:AccessContext,site:Scope,input:Issuance):Promise<Link>{
  if(!actor.actorPersonId)throw new DomainError("FORBIDDEN");
  goDestinationSchema.parse(input.destination);
  if(input.engagementVersionId)throw new DomainError("VALIDATION_FAILED");
  if(input.expiresAt && input.expiresAt<=new Date())throw new DomainError("VALIDATION_FAILED","Expiration must be in the future.");
  const created=await allocateGoLink(tx,actor,{siteId:site.id,organizationId:site.organizationId},input);
  await writeAudit(tx,actor,{
    action:"site.go_link.create",entityType:"site_go_link",entityId:created.id,
    scope:{siteId:site.id,organizationId:site.organizationId},
    after:{packageId:created.packageId,destination:created.destination?.kind,status:created.status,
      name:created.name,channel:created.channel,startsAt:created.startsAt,expiresAt:created.expiresAt},
  });
  return created;
}
/** Issuance for an already authorized immutable engagement version only. */
export async function issueAuthorizedEngagementGoLink(tx:Tx,actor:AccessContext,owner:OwnerScope&{id:string},versionId:string,channel:Link["channel"]){
  const link=await allocateGoLink(tx,actor,owner,{
    engagementVersionId:versionId,destination:null,packageId:null,channel,
  });
  await writeAudit(tx,actor,{
    action:"engagement.go_link.create",entityType:"site_go_link",entityId:link.id,
    scope:{organizationId:owner.organizationId,siteId:owner.siteId},
    after:{engagementId:owner.id,versionId,channel},
  });
  return {linkId:link.id,code:link.code};
}

/** Caller must lock and authorize the row. Revocation is terminal. */
export async function transitionAuthorizedGoLink(tx:Tx,actor:AccessContext,site:Scope,link:Link,desired:"active"|"paused"|"revoked"){
  if(link.engagementVersionId!==null)throw new DomainError("FORBIDDEN");
  return transitionLockedGoLink(tx,actor,{siteId:site.id,organizationId:site.organizationId},link,desired,"site");
}

/** Engagement links expose revoke only; the caller must verify version membership. */
export async function revokeAuthorizedEngagementGoLink(tx:Tx,actor:AccessContext,owner:OwnerScope,link:Link,versionId:string){
  if(link.engagementVersionId!==versionId)throw new DomainError("FORBIDDEN");
  await transitionLockedGoLink(tx,actor,owner,link,"revoked","engagement");
  return {revoked:true};
}

async function transitionLockedGoLink(tx:Tx,actor:AccessContext,scope:OwnerScope,link:Link,desired:"active"|"paused"|"revoked",mode:"site"|"engagement"){
  if(!actor.actorPersonId||actor.delegationMode==="view"||link.siteId!==scope.siteId||link.organizationId!==scope.organizationId)throw new DomainError("FORBIDDEN");
  if(link.status==="revoked" && desired!=="revoked")throw new DomainError("CONFLICT","A revoked link cannot be resumed.");
  const status=goLinkStatusTransition(link.status,desired);
  if(status!==link.status){
    await tx.update(siteGoLinks).set({status,updatedAt:new Date()}).where(eq(siteGoLinks.id,link.id));
    await writeAudit(tx,actor,{action:mode==="engagement"?"engagement.go_link.revoke":status==="revoked"?"site.go_link.revoke":"site.go_link.status_change",
      entityType:"site_go_link",entityId:link.id,scope:{siteId:scope.siteId,organizationId:scope.organizationId},
      before:{status:link.status},after:{status}});
  }
  return {id:link.id,status};
}
