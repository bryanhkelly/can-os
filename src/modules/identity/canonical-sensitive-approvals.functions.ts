import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountCanonicalPrincipals,
  organizations,
} from "@/db/schema";
import {
  canonicalAccountGrants, canonicalAccounts,
  canonicalSensitiveCapabilityApprovals as approvals,
} from "@/db/canonical-v301";
import { assertCANIdentityReviewer } from "@/domain/site-identity-review";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { AuthorizationError } from "@/domain/command-context";
import { writeAudit } from "@/platform/mutation";
import { getCommandContext } from "./command-context.server";
import { getCanonicalCommandContext } from "./canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "./canonical-transaction-authorization.server";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import type { AccessContext } from "@/domain/access-context";

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
  const [account]=await db.select({
    email:accessAccounts.emailNormalized,
    verified:accessAccounts.emailVerifiedAt,
    disabled:accessAccounts.disabled,
  }).from(accessAccounts).where(eq(accessAccounts.id,reviewer.accountId)).limit(1);
  if(!account||!account.verified||account.disabled||
     isDemoAccountEmail(account.email))
    throw new AuthorizationError("verified non-demo institutional reviewer");
  return reviewer;
}

/**
 * Reviewer grants may be revoked while they are inspecting a queue.
 * Recheck and lock the exact existing CAN reviewer session, active grant
 * and institution within the decision transaction. No second login.
 */
async function assertCurrentReviewerInTransaction(
  tx:Pick<typeof db,"execute">,reviewer:AccessContext,
):Promise<void>{
  const raw=(getRequest().headers.get("cookie")??"").split(";")
    .map(part=>part.trim())
    .find(part=>part.startsWith(accessSessionCookie+"="))
    ?.slice(accessSessionCookie.length+1);
  const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
  if(!raw||!/^[A-Za-z0-9_-]{40,}$/.test(raw)||!pepper||pepper.length<32)
    throw new AuthorizationError("current institutional reviewer login");
  const digest=hashAccessSecret(raw,pepper);
  const result=await tx.execute(sql`
    SELECT s.id
    FROM public.access_sessions s
    JOIN public.access_accounts account ON account.id=s.account_id
    JOIN public.account_person_grants grant_row
      ON grant_row.id=s.active_grant_id AND grant_row.account_id=account.id
    JOIN public.organizations organization
      ON organization.id=grant_row.organization_id
    JOIN public.people person ON person.id=grant_row.person_id
    WHERE s.secret_hash=${digest}::text
      AND s.id=${reviewer.sessionId}::uuid
      AND account.id=${reviewer.accountId}::uuid
      AND grant_row.id=${reviewer.grantId}::uuid
      AND grant_row.person_id=${reviewer.actorPersonId}::uuid
      AND grant_row.role='can_network_steward'
      AND grant_row.active=true
      AND grant_row.site_id IS NULL
      AND organization.type='can_network'
      AND person.active=true
      AND account.disabled=false
      AND account.email_verified_at IS NOT NULL
      AND lower(account.email_normalized) NOT LIKE '%.demo'
      AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp()
      AND s.updated_at>clock_timestamp()-interval '30 minutes'
      AND (NOT s.shared_device OR
        s.last_activity_at>clock_timestamp()-interval '5 minutes')
    FOR SHARE OF s,account,grant_row,organization,person
  `);
  if(result.rows.length!==1)
    throw new AuthorizationError("current independent CAN institutional reviewer");
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

/** Current staff can see approval status without learning any other staff's IDs. */
export const getMyCredentialIssuerApproval=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();
    const request=getRequest();
    const can=await getCommandContext(request);
    if(can.sessionAccountId||!["site_admin","registrar"].includes(can.role))
      throw new AuthorizationError("current CAN school staff");
    const canonical=await getCanonicalCommandContext(request);
    const grant=await db.select({id:canonicalAccountGrants.id})
      .from(canonicalAccountGrants)
      .where(and(
        eq(canonicalAccountGrants.personId,canonical.actorPersonId!),
        eq(canonicalAccountGrants.organizationId,canonical.scope.organizationIds![0]!),
        eq(canonicalAccountGrants.siteId,canonical.scope.siteIds![0]!),
        eq(canonicalAccountGrants.roleCode,can.role as "site_admin"|"registrar"),
        eq(canonicalAccountGrants.active,true),
        isNull(canonicalAccountGrants.revokedAt),
      )).limit(2);
    if(grant.length!==1)throw new AuthorizationError("current exact staff grant");
    const [row]=await db.select({
      id:approvals.id,status:approvals.status,
      requestedAt:approvals.requestedAt,reviewedAt:approvals.reviewedAt,
      approvedUntil:approvals.approvedUntil,
    }).from(approvals)
      .where(eq(approvals.canonicalGrantId,grant[0]!.id))
      .orderBy(sql`${approvals.requestedAt} DESC`).limit(1);
    return row??null;
  });

/** A reviewer can revoke active approvals without unrestricted account search. */
export const listActiveCredentialIssuerApprovals=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();
    await requireIndependentInstitutionalReviewer();
    return db.select({
      id:approvals.id,
      requestedByAccountId:approvals.requestedByCanAccountId,
      requestedAt:approvals.requestedAt,
      reviewedAt:approvals.reviewedAt,
      approvedUntil:approvals.approvedUntil,
      nativeOrganizationId:canonicalAccountGrants.organizationId,
      nativeSiteId:canonicalAccountGrants.siteId,
    }).from(approvals).innerJoin(canonicalAccountGrants,
      eq(canonicalAccountGrants.id,approvals.canonicalGrantId))
      .where(eq(approvals.status,"approved")).limit(101);
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
      // A pending request cannot be promoted after native staff/organization
      // authority has been disabled or its hosting relationship has expired.
      const nativeAuthority=await tx.execute(sql`
        SELECT 1
        FROM education_v30.canonical_accounts native_account
        JOIN education_v30.organizations native_org
          ON native_org.id=${grant.organizationId}::uuid
        JOIN education_v30.sites native_site
          ON native_site.id=${grant.siteId}::uuid
        WHERE native_account.id=${grant.accountId}::uuid
          AND native_account.disabled_at IS NULL
          AND native_account.email_verified_at IS NOT NULL
          AND native_org.status='active'
          AND native_site.status IN ('planning','active')
          AND EXISTS (
            SELECT 1 FROM education_v30.site_organization_roles operator_role
            WHERE operator_role.organization_id=${grant.organizationId}::uuid
              AND operator_role.site_id=${grant.siteId}::uuid
              AND operator_role.role_code IN ('operator','host')
              AND operator_role.valid_from<=clock_timestamp()
              AND (operator_role.valid_through IS NULL
                OR operator_role.valid_through>clock_timestamp())
          )
        LIMIT 1
      `);
      if(nativeAuthority.rows.length!==1)
        throw new AuthorizationError("current authorized issuer Site organization");
      const requesterMembership=await tx.select({
        personId:accountPersonGrants.personId,
      }).from(accountPersonGrants)
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .innerJoin(accessAccountCanonicalPrincipals,and(
          eq(accessAccountCanonicalPrincipals.accountId,accountPersonGrants.accountId),
          eq(accessAccountCanonicalPrincipals.canonicalPrincipalId,grant.personId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        ))
        .where(and(
          eq(accountPersonGrants.accountId,approval.requestedByCanAccountId),
          eq(accountPersonGrants.role,grant.roleCode),
          eq(accountPersonGrants.active,true),
          eq(accessAccounts.disabled,false),
          isNotNull(accessAccounts.emailVerifiedAt),
          sql`EXISTS (
            SELECT 1 FROM public.site_canonical_identity_links link
            WHERE link.public_site_id=${accountPersonGrants.siteId}
              AND link.canonical_site_id=${grant.siteId}::uuid
              AND link.status='approved'
              AND link.confirmed_at IS NOT NULL
              AND link.reviewed_at IS NOT NULL
          )`,
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
      await assertCurrentReviewerInTransaction(tx,reviewer);
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
      await assertCurrentReviewerInTransaction(tx,reviewer);
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
