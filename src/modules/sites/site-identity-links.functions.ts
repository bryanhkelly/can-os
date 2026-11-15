import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql, eq, and, exists, gt, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, sites, accessAccounts, accountPersonGrants, accessAccountCanonicalPrincipals } from "@/db/schema";
import {
  auditEvents as canonicalAuditEvents, canonicalAccountGrants, canonicalAccounts,
  canonicalEnrollmentSites, canonicalEnrollmentOrganizations, siteOrganizationRoles,
} from "@/db/canonical-v301";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getCanonicalSessionRow } from "@/modules/identity/canonical-command-context.server";
import { projectCanonicalCommandContext } from "@/domain/canonical-access";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { writeAudit } from "@/platform/mutation";
import {
  siteIdentityConfirmationSchema, siteIdentityRequestSchema,
  siteIdentityReviewSchema, canApproveSiteIdentity, assertCANIdentityReviewer,
} from "@/domain/site-identity-review";

type LinkStatus="pending"|"approved"|"rejected"|"revoked";
type LinkRow={
  publicSiteId:string; canonicalSiteId:string; status:LinkStatus;
  evidenceReference:string; requestedByPersonId:string;
  confirmedByCanonicalPersonId:string|null; confirmedAt:Date|null;
  reviewedByPersonId:string|null;
};
const siteUuid=z.string().uuid();

/** Enforce the database RLS write boundary even when the normal app pool
 * connects as an owner/BYPASSRLS role. The caller's real account is checked
 * before entering this function. Only the narrowly authorized write SQL
 * executes as the non-login role; audit and reads run under normal context.
 *
 * The role is granted to the reviewed runtime DB login during migration.
 * Missing grants fail closed and leave the identity link unchanged.
 */
async function executeReviewedIdentityMutation(
  tx:Pick<typeof db,"execute">,
  action:"request"|"confirm"|"review",
  verifiedActorPersonId:string,
  statement:SQL,
):Promise<void>{
  await tx.execute(sql`SELECT set_config('can.site_identity_action',${action},true)`);
  await tx.execute(sql`SELECT set_config('can.site_identity_actor',${verifiedActorPersonId},true)`);
  await tx.execute(sql.raw("SET LOCAL ROLE can_v30_site_identity_writer"));
  try {
    await tx.execute(statement);
  } finally {
    // An error causes the outer transaction to roll back; RESET may itself
    // fail in an aborted transaction, so do not mask the original failure.
    await tx.execute(sql.raw("RESET ROLE")).catch(()=>{});
  }
}

/** A link is an explicit, three-party verification, NOT an ownership grant.
 * Public registrar requests; native canonical Site operator confirms;
 * independent CAN institutional reviewer decides. All mutations are audited.
 */
export const requestSiteIdentityLink=createServerFn({method:"POST"})
  .validator((v:unknown)=>siteIdentityRequestSchema.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    if(actor.sessionAccountId)throw new AuthorizationError("real Site administrator account");
    assertCapability(actor,"program.launch.start");
    return db.transaction(async tx=>{
      const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId})
        .from(sites).where(eq(sites.id,data.publicSiteId)).for("update").limit(1);
      assertSiteSetupScope(actor,site,"program.launch.start");
      const canonical=await tx.execute(sql`
        SELECT id FROM education_v30.sites
        WHERE id=${data.canonicalSiteId}::uuid AND status IN ('planning','active')
        LIMIT 1
      `);
      if(canonical.rows.length!==1)
        throw new AuthorizationError("eligible canonical Site must already exist");
      const found=await tx.execute(sql`
        SELECT public_site_id AS "publicSiteId",canonical_site_id AS "canonicalSiteId",
          status FROM public.site_canonical_identity_links
        WHERE public_site_id=${site.id}::uuid FOR UPDATE
      `);
      if(found.rows.length){
        const current=found.rows[0] as Record<string,unknown>;
        if(current.canonicalSiteId===data.canonicalSiteId&&current.status==="pending")
          return {status:"pending" as const};
        throw new AuthorizationError("Site identity is already under review or linked");
      }
      await executeReviewedIdentityMutation(tx,"request",actor.actorPersonId!,sql`
        INSERT INTO public.site_canonical_identity_links(
          public_site_id,canonical_site_id,evidence_reference,requested_by_person_id)
        VALUES (${site.id}::uuid,${data.canonicalSiteId}::uuid,
          ${data.evidenceReference},${actor.actorPersonId!}::uuid)
      `);
      await writeAudit(tx,actor,{
        action:"site.identity.link.requested",entityType:"site",entityId:site.id,
        scope:{siteId:site.id,organizationId:site.organizationId},
        after:{canonicalSiteId:data.canonicalSiteId,evidenceReference:data.evidenceReference,
          state:"pending"},
      });
      return {status:"pending" as const};
    });
  });

/** Native operator supplies evidence of the canonical Site's current owner/host
 * relationship. A public Site registration cookie cannot confer this step. */
export const confirmCanonicalSiteIdentityLink=createServerFn({method:"POST"})
  .validator((v:unknown)=>siteIdentityConfirmationSchema.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    // Initial Site verification predates the approved public/native Site link.
    // Bootstrap must use independently authenticated native authority; the
    // ordinary single CAN login starts only after independent link approval.
    const actor=projectCanonicalCommandContext(await getCanonicalSessionRow(getRequest()));
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("canonical Site administrator or registrar");
    const orgId=actor.scope.organizationIds?.length===1?actor.scope.organizationIds[0]:null;
    if(!orgId)throw new AuthorizationError("one current canonical operating organization");
    return db.transaction(async tx=>{
      const found=await tx.execute(sql`
        SELECT public_site_id AS "publicSiteId",canonical_site_id AS "canonicalSiteId",
          status,confirmed_by_canonical_person_id AS "confirmedByCanonicalPersonId"
        FROM public.site_canonical_identity_links
        WHERE public_site_id=${data.publicSiteId}::uuid FOR UPDATE
      `);
      const link=found.rows[0] as Record<string,unknown>|undefined;
      if(!link||link.status!=="pending"||
         !actor.scope.siteIds?.includes(String(link.canonicalSiteId)))
        throw new AuthorizationError("current canonical Site scope and pending link");
      const approved=await tx.execute(sql`
        SELECT s.id FROM education_v30.sites s
        WHERE s.id=${link.canonicalSiteId as string}::uuid
          AND s.status IN ('planning','active')
          AND EXISTS(
            SELECT 1 FROM education_v30.site_organization_roles rel
            WHERE rel.site_id=s.id AND rel.organization_id=${orgId}::uuid
              AND rel.role_code IN ('operator','host')
              AND rel.valid_from<=now()
              AND (rel.valid_through IS NULL OR rel.valid_through>now())
          ) LIMIT 1
      `);
      if(approved.rows.length!==1)
        throw new AuthorizationError("current canonical Site operating relationship");
      if(link.confirmedByCanonicalPersonId){
        if(link.confirmedByCanonicalPersonId===actor.actorPersonId)
          return {status:"confirmed" as const};
        throw new AuthorizationError("already confirmed by another canonical operator");
      }
      await executeReviewedIdentityMutation(tx,"confirm",actor.actorPersonId!,sql`
        UPDATE public.site_canonical_identity_links
        SET confirmed_by_canonical_person_id=${actor.actorPersonId}::uuid,
          confirmed_at=now(),updated_at=now()
        WHERE public_site_id=${data.publicSiteId}::uuid AND status='pending'
      `);
      await tx.insert(canonicalAuditEvents).values({
        actorPersonId:actor.actorPersonId,owningOrganizationId:orgId,
        eventCode:"site.identity.native_confirmed",
        entityKind:"site",entityId:String(link.canonicalSiteId),
        payload:{publicSiteId:data.publicSiteId,siteId:link.canonicalSiteId,
          result:"confirmed_for_independent_review"},
      });
      return {status:"confirmed" as const};
    });
  });

/** A Site's own registrar can see whether the correspondence is still
 * waiting for native confirmation, institutional review, or approval. */
export const getSiteIdentityLinkStatus=createServerFn({method:"GET"})
  .validator((v:unknown)=>z.object({publicSiteId:siteUuid}).strict().parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const [site]=await db.select({id:sites.id,organizationId:sites.organizationId})
      .from(sites).where(eq(sites.id,data.publicSiteId)).limit(1);
    assertSiteSetupScope(actor,site,"program.read");
    const res=await db.execute(sql`
      SELECT canonical_site_id AS "canonicalSiteId",status,
        confirmed_at AS "confirmedAt", reviewed_at AS "reviewedAt"
      FROM public.site_canonical_identity_links
      WHERE public_site_id=${site.id}::uuid LIMIT 1
    `);
    const row=res.rows[0] as Record<string,unknown>|undefined;
    return row?{
      canonicalSiteId:String(row.canonicalSiteId),status:String(row.status),
      confirmed:row.confirmedAt!==null,reviewed:row.reviewedAt!==null,
    }:null;
  });

async function requireCANReviewer() {
  const actor=await getCommandContext(getRequest());
  const orgId=actor.scope.organizationIds?.length===1?actor.scope.organizationIds[0]:null;
  const [organization]=orgId?await db.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,orgId)).limit(1):[];
  assertCANIdentityReviewer(actor,organization);
  return actor;
}

export const listPendingSiteIdentityReviews=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    await requireCANReviewer();
    const r=await db.execute(sql`
      SELECT link.public_site_id AS "publicSiteId",link.canonical_site_id AS "canonicalSiteId",
        pub.name AS "publicSiteName",native.name AS "canonicalSiteName",
        native.site_kind AS "canonicalSiteKind", link.evidence_reference AS "evidenceReference",
        link.confirmed_at AS "confirmedAt"
      FROM public.site_canonical_identity_links link
        JOIN public.sites pub ON pub.id=link.public_site_id
        JOIN education_v30.sites native ON native.id=link.canonical_site_id
      WHERE link.status='pending'
      ORDER BY link.created_at ASC LIMIT 50
    `);
    return r.rows.map(row=>({
      publicSiteId:String(row.publicSiteId),
      canonicalSiteId:String(row.canonicalSiteId),
      publicSiteName:String(row.publicSiteName),
      canonicalSiteName:String(row.canonicalSiteName),
      canonicalSiteKind:String(row.canonicalSiteKind),
      evidenceReference:String(row.evidenceReference),
      canonicalConfirmed:row.confirmedAt!==null,
    }));
  });

/** Reviewer must not be the public requester. A current native confirmation,
 * site-organization relationship and unrevoked native operator grant are
 * rechecked under the review transaction before approval. */
export const reviewSiteIdentityLink=createServerFn({method:"POST"})
  .validator((v:unknown)=>siteIdentityReviewSchema.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await requireCANReviewer();
    return db.transaction(async tx=>{
      const rows=await tx.execute(sql`
        SELECT public_site_id AS "publicSiteId",canonical_site_id AS "canonicalSiteId",
          status,evidence_reference AS "evidenceReference",
          requested_by_person_id AS "requestedByPersonId",
          confirmed_by_canonical_person_id AS "confirmedByCanonicalPersonId",
          confirmed_at AS "confirmedAt",reviewed_by_person_id AS "reviewedByPersonId"
        FROM public.site_canonical_identity_links
        WHERE public_site_id=${data.publicSiteId}::uuid FOR UPDATE
      `);
      const link=rows.rows[0] as LinkRow|undefined;
      if(!link)throw new AuthorizationError("known Site identity link");
      const pending=link.status==="pending";
      if(data.decision==="revoke"?! (link.status==="approved"):!pending)
        throw new AuthorizationError("current link review state");
      if(link.requestedByPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent reviewer distinct from requesting operator");
      let validOperator=false;
      if(data.decision==="approve"){
        const recheck=await tx.execute(sql`
          SELECT 1 FROM education_v30.sites s
          WHERE s.id=${link.canonicalSiteId}::uuid
            AND s.status IN ('planning','active')
            AND EXISTS (
              SELECT 1 FROM education_v30.canonical_account_grants g
              JOIN education_v30.site_organization_roles rel
                ON rel.site_id=g.site_id AND rel.organization_id=g.organization_id
              WHERE g.person_id=${link.confirmedByCanonicalPersonId}::uuid
                AND g.site_id=s.id AND g.active=true AND g.revoked_at IS NULL
                AND g.role_code IN ('site_admin','registrar')
                AND rel.role_code IN ('host','operator')
                AND rel.valid_from<=now()
                AND (rel.valid_through IS NULL OR rel.valid_through>now())
            ) LIMIT 1
        `);
        validOperator=recheck.rows.length===1;
        if(!canApproveSiteIdentity({
          requesterPersonId:link.requestedByPersonId,
          reviewerPersonId:actor.actorPersonId!,
          canonicalConfirmedAt:link.confirmedAt,
          canonicalOperatorStillAuthorized:validOperator,
        }))throw new AuthorizationError("independent native confirmation and current Site authority required");
      }
      const nextStatus=data.decision==="approve"?"approved":data.decision==="reject"?"rejected":"revoked";
      await executeReviewedIdentityMutation(tx,"review",actor.actorPersonId!,sql`
        UPDATE public.site_canonical_identity_links
        SET status=${nextStatus},reviewed_by_person_id=${actor.actorPersonId!}::uuid,
          reviewed_at=now(),updated_at=now()
        WHERE public_site_id=${link.publicSiteId}::uuid
      `);
      await writeAudit(tx,actor,{
        action:"site.identity.link."+data.decision,entityType:"site",
        entityId:link.publicSiteId,scope:{siteId:link.publicSiteId},
        before:{status:link.status,canonicalSiteId:link.canonicalSiteId},
        after:{status:nextStatus,canonicalSiteId:link.canonicalSiteId,
          evidenceReference:link.evidenceReference,
          nativeOperatorAuthorized:validOperator,reason:data.reason},
      });
      return {status:nextStatus};
    });
  });


/**
 * An independent CAN institutional reviewer explicitly attests the verified
 * identity correspondence between an existing CAN school staff account and
 * ONE canonical Person. No email, Site name, or demo membership is treated
 * as an identity match; the native Site and staff grant must already exist.
 *
 * This is an operator provisioning action, NOT an additional end-user login.
 */
const staffPrincipalLinkSchema = z.object({
  publicAccountId: z.string().uuid(),
  publicSiteId: z.string().uuid(),
  canonicalPersonId: z.string().uuid(),
  evidenceReference: z.string().trim().min(25).max(1200),
  identityVerified: z.literal(true),
}).strict();

export const verifyCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .validator((v:unknown) => staffPrincipalLinkSchema.parse(v))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const reviewer = await requireCANReviewer();
    if (!reviewer.accountId || reviewer.sessionAccountId ||
        reviewer.accountId === data.publicAccountId) {
      throw new AuthorizationError("independent CAN identity reviewer");
    }

    return db.transaction(async tx => {
      // Lock both directions. Two reviewers cannot create conflicting
      // mappings concurrently, even before a schema-level uniqueness update.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-source:" + data.publicAccountId}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-person:" + data.canonicalPersonId}))`);

      const [site] = await tx.select({
        id: sites.id, organizationId: sites.organizationId,
      }).from(sites).where(eq(sites.id, data.publicSiteId)).limit(1);
      if (!site) throw new AuthorizationError("existing school Site");

      const links = await tx.execute(sql`
        SELECT canonical_site_id AS "canonicalSiteId"
        FROM public.site_canonical_identity_links
        WHERE public_site_id = ${data.publicSiteId}::uuid AND status = 'approved'
          AND confirmed_at IS NOT NULL AND reviewed_at IS NOT NULL
        LIMIT 2
      `);
      if (links.rows.length !== 1 ||
          typeof links.rows[0]?.canonicalSiteId !== "string") {
        throw new AuthorizationError("independently approved school Site link");
      }
      const canonicalSiteId = String(links.rows[0].canonicalSiteId);
      const [account] = await tx.select({
        id: accessAccounts.id, disabled: accessAccounts.disabled,
        verifiedAt: accessAccounts.emailVerifiedAt,
        email: accessAccounts.emailNormalized,
      }).from(accessAccounts)
        .where(eq(accessAccounts.id, data.publicAccountId)).limit(1);
      // Shared-code demo accounts are public synthetic personas; they cannot
      // establish a verified human identity for privileged canonical SSO.
      if (!account || account.disabled || !account.verifiedAt ||
          isDemoAccountEmail(account.email)) {
        throw new AuthorizationError("verified non-demo CAN staff account");
      }

      const activeGrants = await tx.select({
        personId: accountPersonGrants.personId,
        role: accountPersonGrants.role,
        siteId: accountPersonGrants.siteId,
        organizationId: accountPersonGrants.organizationId,
      }).from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId, data.publicAccountId),
        eq(accountPersonGrants.active, true),
      )).limit(101);
      if (!activeGrants.length || activeGrants.length > 100 ||
          activeGrants.some(item => item.personId !== activeGrants[0]?.personId)) {
        throw new AuthorizationError("one current CAN Person per account");
      }
      if (activeGrants[0]?.personId === reviewer.actorPersonId) {
        throw new AuthorizationError("reviewer cannot link own Person");
      }
      const matchingSchoolRoles = activeGrants.filter(item =>
        item.siteId === site.id && item.organizationId === site.organizationId &&
        (item.role === "site_admin" || item.role === "registrar"));
      if (matchingSchoolRoles.length !== 1) {
        throw new AuthorizationError("one current school administrator role");
      }
      const sourceRole = matchingSchoolRoles[0].role;

      const now = new Date();
      const nativeGrants = await tx.select({
        grantId: canonicalAccountGrants.id,
        role: canonicalAccountGrants.roleCode,
        personId: canonicalAccountGrants.personId,
        siteId: canonicalAccountGrants.siteId,
      }).from(canonicalAccountGrants)
        .innerJoin(canonicalAccounts,
          eq(canonicalAccounts.id, canonicalAccountGrants.accountId))
        .innerJoin(canonicalEnrollmentSites,
          eq(canonicalEnrollmentSites.id, canonicalAccountGrants.siteId))
        .innerJoin(canonicalEnrollmentOrganizations,
          eq(canonicalEnrollmentOrganizations.id, canonicalAccountGrants.organizationId))
        .where(and(
          eq(canonicalAccountGrants.personId, data.canonicalPersonId),
          eq(canonicalAccountGrants.siteId, canonicalSiteId),
          eq(canonicalAccountGrants.roleCode,
            sourceRole === "site_admin" ? "site_admin" : "registrar"),
          eq(canonicalAccountGrants.active, true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
          inArray(canonicalEnrollmentSites.status, ["planning", "active"]),
          eq(canonicalEnrollmentOrganizations.status, "active"),
          exists(tx.select({id: siteOrganizationRoles.id}).from(siteOrganizationRoles).where(and(
            eq(siteOrganizationRoles.siteId, canonicalAccountGrants.siteId),
            eq(siteOrganizationRoles.organizationId, canonicalAccountGrants.organizationId),
            inArray(siteOrganizationRoles.roleCode, ["operator", "host"]),
            lte(siteOrganizationRoles.validFrom, now),
            or(isNull(siteOrganizationRoles.validThrough),
              gt(siteOrganizationRoles.validThrough, now)),
          ))),
        )).limit(2);
      if (nativeGrants.length !== 1) {
        throw new AuthorizationError("one currently authorized canonical staff Person");
      }
      const linksForAccount = await tx.select({id: accessAccountCanonicalPrincipals.id})
        .from(accessAccountCanonicalPrincipals)
        .where(and(
          eq(accessAccountCanonicalPrincipals.accountId, data.publicAccountId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        )).limit(2);
      const linksForPerson = await tx.select({id: accessAccountCanonicalPrincipals.id})
        .from(accessAccountCanonicalPrincipals)
        .where(and(
          eq(accessAccountCanonicalPrincipals.canonicalPrincipalId, data.canonicalPersonId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        )).limit(2);
      if (linksForAccount.length || linksForPerson.length) {
        throw new AuthorizationError("identity already linked; review before replacement");
      }

      const [created] = await tx.insert(accessAccountCanonicalPrincipals).values({
        accountId: data.publicAccountId,
        canonicalPrincipalId: data.canonicalPersonId,
        verifiedAt: now, verifiedByAccountId: reviewer.accountId,
      }).returning({id: accessAccountCanonicalPrincipals.id});
      if (!created) throw new Error("Unable to complete verified principal link");

      await writeAudit(tx, reviewer, {
        action: "identity.canonical_staff.verified",
        entityType: "access_account_canonical_principal", entityId: created.id,
        scope: {siteId: data.publicSiteId, organizationId: site.organizationId},
        after: {
          canonicalPersonId: data.canonicalPersonId,
          canonicalSiteId, evidenceReference: data.evidenceReference,
          independentlyVerified: true, sourceRole,
        },
      });
      return { linked: true as const };
    });
  });


/** Revocation is immediate because the CAN sign-in bridge rechecks every use. */
export const revokeCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .validator((v:unknown) => z.object({
    publicAccountId: z.string().uuid(),
    reason: z.string().trim().min(25).max(1200),
  }).strict().parse(v))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const reviewer = await requireCANReviewer();
    if (!reviewer.accountId || reviewer.sessionAccountId ||
        reviewer.accountId === data.publicAccountId) {
      throw new AuthorizationError("independent CAN identity reviewer");
    }
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-source:" + data.publicAccountId}))`);
      const [current] = await tx.select({
        id: accessAccountCanonicalPrincipals.id,
        canonicalPersonId: accessAccountCanonicalPrincipals.canonicalPrincipalId,
      }).from(accessAccountCanonicalPrincipals).where(and(
        eq(accessAccountCanonicalPrincipals.accountId, data.publicAccountId),
        isNull(accessAccountCanonicalPrincipals.revokedAt),
      )).for("update").limit(1);
      if (!current) return {revoked: false as const};
      await tx.update(accessAccountCanonicalPrincipals).set({
        revokedAt: new Date(),
      }).where(eq(accessAccountCanonicalPrincipals.id, current.id));
      await writeAudit(tx, reviewer, {
        action: "identity.canonical_staff.revoked",
        entityType: "access_account_canonical_principal", entityId: current.id,
        before: { canonicalPersonId: current.canonicalPersonId, status: "active" },
        after: { status: "revoked", reason: data.reason },
      });
      return {revoked: true as const};
    });
  });
