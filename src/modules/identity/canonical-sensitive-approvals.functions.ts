import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountCanonicalPrincipals,
  organizations, siteCanonicalIdentityLinks,
} from "@/db/schema";
import {
  canonicalAccountGrants, canonicalAccounts,
  canonicalSensitiveCapabilityApprovals as approvals,
} from "@/db/canonical-v301";
import { assertCANIdentityReviewer } from "@/domain/site-identity-review";
import { AuthorizationError } from "@/domain/command-context";
import { writeAudit } from "@/platform/mutation";
import { getCommandContext } from "./command-context.server";
import { getCanonicalCommandContext } from "./canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "./canonical-transaction-authorization.server";

const uuid=z.string().uuid();
const requestSchema=z.object({
  evidenceReference:z.string().trim().min(25).max(1200),
}).strict();
const reviewSchema=z.object({
  approvalId:uuid,
  decision:z.enum(["approve","reject"]),
  evidenceReference:z.string().trim().min(25).max(1200),
  expiresAt:z.string().datetime({offset:true}).optional(),
}).strict();
const revokeSchema=z.object({
  approvalId:uuid,
  reason:z.string().trim().min(25).max(1200),
}).strict();

function protect() {
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

async function requireIndependentInstitutionalReviewer() {
  const reviewer=await getCommandContext(getRequest());
  if(reviewer.sessionAccountId)throw new AuthorizationError("actual reviewer account");
  const organizationId=reviewer.scope.organizationIds?.length===1
    ? reviewer.scope.organizationIds[0]:null;
  const [organization]=organizationId?await db.select({
    id:organizations.id,type:organizations.type,
  }).from(organizations).where(eq(organizations.id,organizationId)).limit(1):[];
  assertCANIdentityReviewer(reviewer,organization);
  return reviewer;
}

/** Existing CAN school staff may request, but never self-approve, issuer authority. */
export const requestCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((value:unknown)=>requestSchema.parse(value))
  .handler(async({data})=>{
    protect();
    const request=getRequest();
    const can=await getCommandContext(request);
    if(!can.actorPersonId||can.sessionAccountId||
       !["site_admin","registrar"].includes(can.role))
      throw new AuthorizationError("verified non-demo Site administrator");
    const canonical=await getCanonicalCommandContext(request);
    if(!canonical.actorPersonId || canonical.role!==can.role ||
       canonical.scope.siteIds?.length!==1 ||
       canonical.scope.organizationIds?.length!==1)
      throw new AuthorizationError("one verified canonical Site staff assignment");

    return db.transaction(async tx=>{
      await assertCurrentCanonicalStaffForMutation(tx,request,canonical);
      // The trusted canonical identity came from a restricted session reader.
      // No browser-provided Person, Site, role or native grant is accepted.
      const candidates=await tx.select({id:canonicalAccountGrants.id})
        .from(canonicalAccountGrants)
        .innerJoin(canonicalAccounts,
          eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
        .where(and(
          eq(canonicalAccountGrants.personId,canonical.actorPersonId!),
          eq(canonicalAccountGrants.organizationId,canonical.scope.organizationIds![0]!),
          eq(canonicalAccountGrants.siteId,canonical.scope.siteIds![0]!),
          eq(canonicalAccountGrants.roleCode,can.role as "site_admin"|"registrar"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccounts.disabledAt),
        )).limit(2);
      if(candidates.length!==1)
        throw new AuthorizationError("unique current canonical staff grant");
      const grantId=candidates[0]!.id;
      const existing=await tx.select({id:approvals.id}).from(approvals)
        .where(and(eq(approvals.canonicalGrantId,grantId),
          eq(approvals.capabilityCode,"credential.issue"),
          sql`${approvals.status} IN ('pending','approved')`)).limit(1);
      if(existing.length)throw new AuthorizationError("issuer approval already requested or approved");
      const [created]=await tx.insert(approvals).values({
        canonicalGrantId:grantId,capabilityCode:"credential.issue",
        requestedByCanAccountId:can.accountId,
        requestEvidenceReference:data.evidenceReference,
      }).returning({id:approvals.id});
      if(!created)throw new Error("Issuer approval request was not saved");
      await writeAudit(tx,can,{
        action:"canonical.credential_issuer.requested",
        entityType:"canonical_sensitive_capability_approval",entityId:created.id,
        scope:{organizationId:canonical.scope.organizationIds![0]!,
          siteId:canonical.scope.siteIds![0]!},
        after:{capabilityCode:"credential.issue",evidenceReference:data.evidenceReference},
      });
      return {requested:true as const,approvalId:created.id};
    });
  });

/** CAN network stewards review pending requests; pending is never authority. */
export const listPendingCredentialIssuerApprovals=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();
    await requireIndependentInstitutionalReviewer();
    return db.select({
      id:approvals.id,
      requestedByAccountId:approvals.requestedByCanAccountId,
      evidenceReference:approvals.requestEvidenceReference,
      requestedAt:approvals.requestedAt,
      nativeGrantId:approvals.canonicalGrantId,
      nativeOrganizationId:canonicalAccountGrants.organizationId,
      nativeSiteId:canonicalAccountGrants.siteId,
      nativeRole:canonicalAccountGrants.roleCode,
    }).from(approvals).innerJoin(canonicalAccountGrants,
      eq(canonicalAccountGrants.id,approvals.canonicalGrantId))
      .where(eq(approvals.status,"pending")).limit(101);
  });

/** Approval requires separate current CAN reviewer and rechecks current grant. */
export const reviewCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((value:unknown)=>reviewSchema.parse(value))
  .handler(async({data})=>{
    protect();
    const reviewer=await requireIndependentInstitutionalReviewer();
    if(data.decision==="approve"&&!data.expiresAt)
      throw new AuthorizationError("explicit issuer approval expiry");
    const expiresAt=data.expiresAt?new Date(data.expiresAt):null;
    const now=new Date();
    if(expiresAt&&(expiresAt.getTime()<=now.getTime()||
       expiresAt.getTime()>now.getTime()+366*24*60*60*1000))
      throw new AuthorizationError("issuer approval expires within one year");
    return db.transaction(async tx=>{
      const [approval]=await tx.select().from(approvals)
        .where(eq(approvals.id,data.approvalId)).for("update").limit(1);
      if(!approval||approval.status!=="pending"||
         !reviewer.accountId||approval.requestedByCanAccountId===reviewer.accountId)
        throw new AuthorizationError("independent pending issuer request");

      const [grant]=await tx.select().from(canonicalAccountGrants)
        .where(eq(canonicalAccountGrants.id,approval.canonicalGrantId)).limit(1);
      if(!grant||!grant.siteId||!grant.active||grant.revokedAt||
         !["site_admin","registrar"].includes(grant.roleCode))
        throw new AuthorizationError("current native Site staff grant");
      const requesterMembership=await tx.select({
        personId:accountPersonGrants.personId,
      }).from(accountPersonGrants)
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .innerJoin(accessAccountCanonicalPrincipals,and(
          eq(accessAccountCanonicalPrincipals.accountId,accountPersonGrants.accountId),
          eq(accessAccountCanonicalPrincipals.canonicalPrincipalId,grant.personId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        ))
        .innerJoin(siteCanonicalIdentityLinks,and(
          eq(siteCanonicalIdentityLinks.publicSiteId,accountPersonGrants.siteId),
          eq(siteCanonicalIdentityLinks.canonicalSiteId,grant.siteId),
          eq(siteCanonicalIdentityLinks.status,"approved"),
        ))
        .where(and(
          eq(accountPersonGrants.accountId,approval.requestedByCanAccountId),
          eq(accountPersonGrants.role,grant.roleCode),
          eq(accountPersonGrants.active,true),
          eq(accessAccounts.disabled,false),
        )).limit(2);
      if(requesterMembership.length!==1||
         requesterMembership[0]?.personId===reviewer.actorPersonId)
        throw new AuthorizationError("independent current requester staff identity");
      if(data.decision==="approve"){
        // Reviewer account must never be a second alias for the native issuer.
        const selfNative=await tx.select({id:accessAccountCanonicalPrincipals.id})
          .from(accessAccountCanonicalPrincipals)
          .where(and(
            eq(accessAccountCanonicalPrincipals.accountId,reviewer.accountId),
            eq(accessAccountCanonicalPrincipals.canonicalPrincipalId,grant.personId),
            isNull(accessAccountCanonicalPrincipals.revokedAt),
          )).limit(1);
        if(selfNative.length)throw new AuthorizationError("reviewer may not approve own native Person");
      }
      await tx.update(approvals).set({
        status:data.decision==="approve"?"approved":"rejected",
        reviewedByCanAccountId:reviewer.accountId,
        reviewedAt:now,
        reviewEvidenceReference:data.evidenceReference,
        approvedUntil:data.decision==="approve"?expiresAt:null,
      }).where(eq(approvals.id,approval.id));
      await writeAudit(tx,reviewer,{
        action:data.decision==="approve"?
          "canonical.credential_issuer.approved":"canonical.credential_issuer.rejected",
        entityType:"canonical_sensitive_capability_approval",
        entityId:approval.id,
        scope:{organizationId:grant.organizationId,siteId:grant.siteId},
        after:{decision:data.decision,expiresAt:expiresAt?.toISOString()??null,
          evidenceReference:data.evidenceReference},
      });
      return {status:data.decision==="approve"?"approved" as const:"rejected" as const};
    });
  });

/** The independent reviewer can revoke before the expiry; award rows remain intact. */
export const revokeCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((value:unknown)=>revokeSchema.parse(value))
  .handler(async({data})=>{
    protect();
    const reviewer=await requireIndependentInstitutionalReviewer();
    return db.transaction(async tx=>{
      const [approval]=await tx.select().from(approvals)
        .where(eq(approvals.id,data.approvalId)).for("update").limit(1);
      if(!approval||approval.status!=="approved"||
         approval.requestedByCanAccountId===reviewer.accountId)
        throw new AuthorizationError("current independently approved issuer");
      const [grant]=await tx.select({
        siteId:canonicalAccountGrants.siteId,
        organizationId:canonicalAccountGrants.organizationId,
      }).from(canonicalAccountGrants)
        .where(eq(canonicalAccountGrants.id,approval.canonicalGrantId)).limit(1);
      await tx.update(approvals).set({
        status:"revoked",revokedAt:new Date(),
        revokedByCanAccountId:reviewer.accountId,
        revokedReason:data.reason,
      }).where(eq(approvals.id,approval.id));
      await writeAudit(tx,reviewer,{
        action:"canonical.credential_issuer.revoked",
        entityType:"canonical_sensitive_capability_approval",
        entityId:approval.id,
        scope:{organizationId:grant?.organizationId,siteId:grant?.siteId},
        after:{reason:data.reason},
      });
      return {revoked:true as const};
    });
  });
