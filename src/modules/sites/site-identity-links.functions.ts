import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, sites } from "@/db/schema";
import { auditEvents as canonicalAuditEvents } from "@/db/canonical-v301";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
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
      await tx.execute(sql`
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
    const actor=await getCanonicalCommandContext(getRequest());
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
      await tx.execute(sql`
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
      await tx.execute(sql`
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
