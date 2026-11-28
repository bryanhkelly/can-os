import { and, eq, sql } from "drizzle-orm";
import {parseCommandInput} from "@/domain/command-input";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, organizations } from "@/db/schema";
import { canonicalSensitiveCapabilityApprovals as approvals } from "@/db/canonical-v301";
import { assertCANCredentialIssuerReviewer } from "@/domain/credential-issuer-review";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { writeAudit } from "@/platform/mutation";
import { getIdentityContext } from "./command-context.server";
import type { AccessContext } from "@/domain/access-context";
import { assertCurrentCANGrantForMutation } from "./current-can-grant-transaction.server";

import {requestSchema,reviewSchema,revokeSchema} from "./canonical-sensitive-approvals.inputs";

/** Resolve the exact current CAN grant, never a native v3 identity. */
function issuerStaffScope(can:AccessContext) {
  const org=can.scope.organizationIds?.length===1?can.scope.organizationIds[0]:null;
  const site=can.scope.siteIds?.length===1?can.scope.siteIds[0]:null;
  if(!org||!site||!can.grantId||!can.actorPersonId||can.sessionAccountId||
     !["site_admin","registrar"].includes(can.role)||can.grantSiteId!==site)
    throw new AuthorizationError("exact CAN issuer staff assignment");
  return {org,site,grantId:can.grantId};
}

/** The active grant and operating Site relationship are separate checks. */
async function assertIssuerOperatingSite(tx:Pick<typeof db,"execute">,org:string,site:string) {
  const result=await tx.execute(sql`
    SELECT 1 FROM public.organizations o JOIN public.sites s
      ON s.organization_id=o.id
    WHERE o.id=${org}::uuid AND s.id=${site}::uuid
      AND o.lifecycle_status='active'
      AND s.lifecycle_status IN ('planning','active')
      AND EXISTS (
        SELECT 1 FROM public.site_organization_roles sor
        WHERE sor.organization_id=o.id AND sor.site_id=s.id
          AND sor.role_code IN ('operator','host')
          AND sor.valid_from<=clock_timestamp()
          AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
      )
    FOR SHARE OF o,s
  `);
  if(result.rows.length!==1)throw new AuthorizationError("current authorized issuer Site");
}

async function requireIndependentInstitutionalReviewer(request:Request) {
  const reviewer=await getIdentityContext(request);
  if(reviewer.sessionAccountId)throw new AuthorizationError("actual reviewer account");
  const organizationId=reviewer.scope.organizationIds?.length===1
    ? reviewer.scope.organizationIds[0]:null;
  const [organization]=organizationId?await db.select({
    id:organizations.id,type:organizations.type,
  }).from(organizations).where(eq(organizations.id,organizationId)).limit(1):[];
  assertCANCredentialIssuerReviewer(reviewer,organization);
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
  tx:Pick<typeof db,"execute">,reviewer:AccessContext,request:Request,
):Promise<void>{
  const organizationId=reviewer.scope.organizationIds?.length===1
    ? reviewer.scope.organizationIds[0] : null;
  if(!organizationId)throw new AuthorizationError("current CAN reviewer organization");
  // Same public Person, immutable account and current role. The shared guard
  // locks both the grant and CAN network classification through decision write.
  await assertCurrentCANGrantForMutation(tx,request,reviewer,{
    roles:["can_credential_reviewer"],
    organizationId,siteId:null,organizationType:"can_network",
  });
}

/**
 * The application's broad SQL connection must not mutate issuer approvals
 * directly. Enter the dedicated NOLOGIN/NOBYPASSRLS role only for the
 * previously authorized INSERT or UPDATE, then reset before audit writes.
 * Missing deployment membership fails closed, never retries as owner.
 */
async function withSensitiveApprovalWriter<T>(
  tx:Pick<typeof db,"execute">,
  action:"request"|"review"|"revoke",
  actorAccountId:string,
  mutation:()=>Promise<T>,
):Promise<T>{
  await tx.execute(sql`SELECT set_config('can.issuer_approval_action',${action},true)`);
  await tx.execute(sql`SELECT set_config('can.issuer_approval_actor',${actorAccountId},true)`);
  await tx.execute(sql.raw("SET LOCAL ROLE can_v30_sensitive_approval_writer"));
  try {
    return await mutation();
  } finally {
    // An aborted transaction can reject RESET ROLE. The outer transaction
    // will roll back, and the original error must not be hidden.
    await tx.execute(sql.raw("RESET ROLE")).catch(()=>{});
  }
}

/** Existing CAN school staff may request, but never self-approve, issuer authority. */
export async function requestCanonicalCredentialIssuerApprovalService(request:Request,raw:unknown){
 const data=parseCommandInput(requestSchema,raw);
    const can=await getIdentityContext(request);
    if(!can.actorPersonId||can.sessionAccountId||
       !["site_admin","registrar"].includes(can.role))
      throw new AuthorizationError("verified non-demo Site administrator");
    const scope=issuerStaffScope(can);
    return db.transaction(async tx=>{
      await assertCurrentCANGrantForMutation(tx,request,can,{
        roles:["site_admin","registrar"],organizationId:scope.org,siteId:scope.site,
      });
      await assertIssuerOperatingSite(tx,scope.org,scope.site);
      const grantId=scope.grantId;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credential-issuer-request:"+grantId}))`);
      const existing=await tx.select({id:approvals.id,accountId:approvals.requestedByCanAccountId,evidence:approvals.requestEvidenceReference}).from(approvals)
        .where(and(eq(approvals.accountPersonGrantId,grantId),
          eq(approvals.capabilityCode,"credential.issue"),
          sql`${approvals.status} IN ('pending','approved')`)).limit(1);
      if(existing.length){
        const prior=existing[0]!;
        if(prior.accountId===can.accountId&&prior.evidence===data.evidenceReference)return {requested:true as const,approvalId:prior.id};
        throw new DomainError("CONFLICT","Issuer approval already requested or approved with different evidence");
      }
      const [created]=await withSensitiveApprovalWriter(
        tx,"request",can.accountId,()=>tx.insert(approvals).values({
          accountPersonGrantId:grantId,capabilityCode:"credential.issue",
          requestedByCanAccountId:can.accountId,
          requestEvidenceReference:data.evidenceReference,
        }).returning({id:approvals.id}),
      );
      if(!created)throw new Error("Issuer approval request was not saved");
      await writeAudit(tx,can,{
        action:"canonical.credential_issuer.requested",
        entityType:"canonical_sensitive_capability_approval",entityId:created.id,
        scope:{organizationId:scope.org,siteId:scope.site},
        after:{capabilityCode:"credential.issue",evidenceReference:data.evidenceReference},
      });
      return {requested:true as const,approvalId:created.id};
    });

}

/** Current staff can see approval status without learning any other staff's IDs. */
export async function getMyCredentialIssuerApprovalService(request:Request){
    const can=await getIdentityContext(request);
    if(can.sessionAccountId||!["site_admin","registrar"].includes(can.role))
      throw new AuthorizationError("current CAN school staff");
    const {grantId}=issuerStaffScope(can);
    const [row]=await db.select({
      id:approvals.id,status:approvals.status,
      requestedAt:approvals.requestedAt,reviewedAt:approvals.reviewedAt,
      approvedUntil:approvals.approvedUntil,
    }).from(approvals)
      .where(and(eq(approvals.accountPersonGrantId,grantId),
        eq(approvals.requestedByCanAccountId,can.accountId)))
      .orderBy(sql`${approvals.requestedAt} DESC`).limit(1);
    return row??null;

}

/** A reviewer can revoke active approvals without unrestricted account search. */
export async function listActiveCredentialIssuerApprovalsService(request:Request){
    await requireIndependentInstitutionalReviewer(request);
    return db.select({
      id:approvals.id,
      requestedByAccountId:approvals.requestedByCanAccountId,
      requestedAt:approvals.requestedAt,
      reviewedAt:approvals.reviewedAt,
      approvedUntil:approvals.approvedUntil,
      organizationId:accountPersonGrants.organizationId,
      siteId:accountPersonGrants.siteId,
    }).from(approvals).innerJoin(accountPersonGrants,
      and(eq(accountPersonGrants.id,approvals.accountPersonGrantId),
        eq(accountPersonGrants.accountId,approvals.requestedByCanAccountId)))
      .where(eq(approvals.status,"approved")).limit(101);

}

/** CAN network stewards review pending requests; pending is never authority. */
export async function listPendingCredentialIssuerApprovalsService(request:Request){
    await requireIndependentInstitutionalReviewer(request);
    return db.select({
      id:approvals.id,
      requestedByAccountId:approvals.requestedByCanAccountId,
      evidenceReference:approvals.requestEvidenceReference,
      requestedAt:approvals.requestedAt,
      grantId:approvals.accountPersonGrantId,
      organizationId:accountPersonGrants.organizationId,
      siteId:accountPersonGrants.siteId,
      role:accountPersonGrants.role,
    }).from(approvals).innerJoin(accountPersonGrants,
      and(eq(accountPersonGrants.id,approvals.accountPersonGrantId),
        eq(accountPersonGrants.accountId,approvals.requestedByCanAccountId)))
      .where(eq(approvals.status,"pending")).limit(101);

}

/** Approval requires separate current CAN reviewer and rechecks current grant. */
export async function reviewCanonicalCredentialIssuerApprovalService(request:Request,raw:unknown){
 const data=parseCommandInput(reviewSchema,raw);
    const reviewer=await requireIndependentInstitutionalReviewer(request);
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

      const [grant]=await tx.select().from(accountPersonGrants)
        .where(eq(accountPersonGrants.id,approval.accountPersonGrantId)).for("share").limit(1);
      if(!grant||!grant.organizationId||!grant.siteId||!grant.active||
         !["site_admin","registrar"].includes(grant.role)||
         grant.accountId!==approval.requestedByCanAccountId||
         grant.personId===reviewer.actorPersonId)
        throw new AuthorizationError("independent current CAN issuer grant");
      const verified=await tx.execute(sql`
        SELECT 1 FROM public.access_accounts a JOIN public.people p ON p.id=a.person_id
        WHERE a.id=${approval.requestedByCanAccountId}::uuid
          AND a.person_id=${grant.personId}::uuid
          AND a.disabled=false AND a.email_verified_at IS NOT NULL AND p.active=true
        FOR SHARE OF a,p
      `);
      if(verified.rows.length!==1)
        throw new AuthorizationError("verified current requester account and Person");
      await assertIssuerOperatingSite(tx,grant.organizationId,grant.siteId);
      await assertCurrentReviewerInTransaction(tx,reviewer,request);
      await withSensitiveApprovalWriter(tx,"review",reviewer.accountId,
        ()=>tx.update(approvals).set({
          status:data.decision==="approve"?"approved":"rejected",
          reviewedByCanAccountId:reviewer.accountId,
          reviewedAt:now,
          reviewEvidenceReference:data.evidenceReference,
          approvedUntil:data.decision==="approve"?expiresAt:null,
        }).where(eq(approvals.id,approval.id)),
      );
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

}

/** The independent reviewer can revoke before the expiry; award rows remain intact. */
export async function revokeCanonicalCredentialIssuerApprovalService(request:Request,raw:unknown){
 const data=parseCommandInput(revokeSchema,raw);
    const reviewer=await requireIndependentInstitutionalReviewer(request);
    return db.transaction(async tx=>{
      const [approval]=await tx.select().from(approvals)
        .where(eq(approvals.id,data.approvalId)).for("update").limit(1);
      if(!approval||approval.status!=="approved"||
         approval.requestedByCanAccountId===reviewer.accountId)
        throw new AuthorizationError("current independently approved issuer");
      const [grant]=await tx.select({
        siteId:accountPersonGrants.siteId,
        organizationId:accountPersonGrants.organizationId,
        personId:accountPersonGrants.personId,
      }).from(accountPersonGrants)
        .where(eq(accountPersonGrants.id,approval.accountPersonGrantId)).limit(1);
      if(!grant||grant.personId===reviewer.actorPersonId)
        throw new AuthorizationError("independent existing CAN issuer");
      await assertCurrentReviewerInTransaction(tx,reviewer,request);
      await withSensitiveApprovalWriter(tx,"revoke",reviewer.accountId,
        ()=>tx.update(approvals).set({
          status:"revoked",revokedAt:new Date(),
          revokedByCanAccountId:reviewer.accountId,
          revokedReason:data.reason,
        }).where(eq(approvals.id,approval.id)),
      );
      await writeAudit(tx,reviewer,{
        action:"canonical.credential_issuer.revoked",
        entityType:"canonical_sensitive_capability_approval",
        entityId:approval.id,
        scope:{organizationId:grant?.organizationId,siteId:grant?.siteId},
        after:{reason:data.reason},
      });
      return {revoked:true as const};
    });

}
