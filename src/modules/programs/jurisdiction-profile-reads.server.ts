import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {db} from "@/db/client";
import {jurisdictionProfileVersions,jurisdictions,organizations} from "@/db/schema";
import {and,eq,desc,inArray,ne,or,isNull} from "drizzle-orm";
type ProfileAuthority = "manage" | "verify";
export async function assertJurisdictionProfileAuthority(
 context: Awaited<ReturnType<typeof getCommandContext>>,
 authority: ProfileAuthority,
) {
 const manager=authority==="manage";
 const role=manager?"can_network_steward":"can_jurisdiction_reviewer";
 const capability=manager?"jurisdiction.profile.manage":"jurisdiction.profile.verify";
 if(context.role!==role||!context.actorPersonId||context.grantSiteId!==null)
  throw new AuthorizationError(capability);
 assertCapability(context,capability);
 const organizationIds=context.scope.organizationIds??[];
 if(organizationIds.length===0)throw new AuthorizationError("CAN network organization scope");
 const [organization]=await db.select({id:organizations.id}).from(organizations).where(and(
  eq(organizations.type,"can_network"),inArray(organizations.id,organizationIds),
 )).limit(1);
 if(!organization)throw new AuthorizationError("CAN network organization scope");
}


/**
 * Registrar-facing editorial read. Review records are never exposed through
 * public launch projections; only a published version can inform launch.
 */
export async function listJurisdictionProfileReviewsService(request:Request){
 const context=await getCommandContext(request);
 const canManage=context.role==="can_network_steward";
 const canVerify=context.role==="can_jurisdiction_reviewer";
 if(!canManage&&!canVerify)throw new AuthorizationError("jurisdiction profile review access");
 await assertJurisdictionProfileAuthority(context,canManage?"manage":"verify");
 const rows=await db.select({
  id:jurisdictionProfileVersions.id,
  jurisdictionId:jurisdictions.id,
  code:jurisdictions.code,
  name:jurisdictions.name,
  revision:jurisdictionProfileVersions.revision,
  status:jurisdictionProfileVersions.status,
  verificationStatus:jurisdictionProfileVersions.verificationStatus,
  title:jurisdictionProfileVersions.title,
  summary:jurisdictionProfileVersions.summary,
  profile:jurisdictionProfileVersions.profile,
  evidence:jurisdictionProfileVersions.evidence,
  lastEditedByPersonId:jurisdictionProfileVersions.lastEditedByPersonId,
  verifiedByPersonId:jurisdictionProfileVersions.verifiedByPersonId,
  verificationEvidence:jurisdictionProfileVersions.verificationEvidence,
  reviewedAt:jurisdictionProfileVersions.reviewedAt,
  nextReviewAt:jurisdictionProfileVersions.nextReviewAt,
  publishedAt:jurisdictionProfileVersions.publishedAt,
 }).from(jurisdictionProfileVersions)
 .innerJoin(jurisdictions,eq(jurisdictions.id,jurisdictionProfileVersions.jurisdictionId))
 .where(inArray(jurisdictionProfileVersions.status,["draft","in_review","published"]))
 .orderBy(jurisdictions.name,desc(jurisdictionProfileVersions.createdAt));
 return rows.map(row=>({...row,canEdit:canManage,canVerify,canPublish:canManage,
  profile:JSON.stringify(row.profile),evidence:JSON.stringify(row.evidence),
  verificationEvidence:JSON.stringify(row.verificationEvidence)}));
}

/** A bounded, evidence-free projection of the same governed review workspace.
 * Independent verification does not grant publication or Site-opening authority. */
export async function listJurisdictionWorkService(request:Request){
 const actor=await getCommandContext(request);
 const reviewer=actor.role==="can_jurisdiction_reviewer";
 if(!reviewer&&actor.role!=="can_network_steward")throw new AuthorizationError("jurisdiction review appointment");
 await assertJurisdictionProfileAuthority(actor,reviewer?"verify":"manage");
 const rows=await db.select({id:jurisdictionProfileVersions.id,title:jurisdictionProfileVersions.title,
  status:jurisdictionProfileVersions.status,verificationStatus:jurisdictionProfileVersions.verificationStatus,
  createdAt:jurisdictionProfileVersions.createdAt,nextReviewAt:jurisdictionProfileVersions.nextReviewAt})
  .from(jurisdictionProfileVersions)
  .where(reviewer?and(eq(jurisdictionProfileVersions.status,"in_review"),eq(jurisdictionProfileVersions.verificationStatus,"unverified"),
    or(isNull(jurisdictionProfileVersions.lastEditedByPersonId),ne(jurisdictionProfileVersions.lastEditedByPersonId,actor.actorPersonId!))):
    inArray(jurisdictionProfileVersions.status,["draft","in_review"]))
  .orderBy(desc(jurisdictionProfileVersions.createdAt),jurisdictionProfileVersions.id).limit(101);
 return {items:rows.slice(0,100).map(row=>({id:row.id,title:row.title,status:row.status==="draft"?"draft":row.verificationStatus==="verified"?"verified_pending_publication":"pending_verification",createdAt:row.createdAt.toISOString(),dueAt:row.nextReviewAt?.toISOString()??null})),possiblyTruncated:rows.length>100};
}
