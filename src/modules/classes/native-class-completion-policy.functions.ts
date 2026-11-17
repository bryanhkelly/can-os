import { and, desc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents,
  canonicalClasses, classCompletionPolicyVersions,
  evidenceDocuments,evidenceDocumentVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { validateClassAuthority } from "@/modules/classes/unified-class-authority.server";

const uuid=z.string().uuid();
const input=z.object({
  classId:uuid,
  expectedLatestVersion:z.number().int().positive().nullable(),
  requireAllLessons:z.boolean(),
  requiredVerifiedSessions:z.number().int().min(0).max(52),
  requirePassingAssessment:z.boolean(),
  policyEvidenceVersionId:uuid,
  effectiveAt:z.string().datetime({offset:true}).optional(),
}).strict().refine(data=>data.requireAllLessons||
  data.requiredVerifiedSessions>0||data.requirePassingAssessment,
  "An independently approved policy must specify meaningful completion evidence");

/** Publish an immutable original-Class completion policy for future learners.
 * The Class creator is its accountable author and CANNOT approve the policy.
 * The independent exact-Site provider reviewer must present separately
 * independently verified, current provider-owned policy evidence.
 *
 * This is deliberately not a Class Outcome, award or academic grade writer.
 * It does not backfill students already enrolled under another/no policy.
 */
export const publishNativeClassCompletionPolicy=createServerFn({method:"POST"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true" ||
       process.env.CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED!=="true")
      throw new AuthorizationError("Class completion policy publication not activated");
    const request=getRequest(),actor=await getCanonicalCommandContext(request);
    if(!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role??"") ||
       actor.scope.organizationIds?.length!==1 ||
       actor.scope.siteIds?.length!==1)
      throw new AuthorizationError("one independent authorized Class policy reviewer");
    assertCapability(actor,"class.manage");
    return db.transaction(async tx=>{
      // Serialize concurrent policy versions from the Class row, not a
      // browser-selected version or an optional Class Offering.
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId))
        .for("update").limit(1);
      if(!cls || !cls.siteId || cls.siteId!==actor.scope.siteIds?.[0] ||
         cls.operatingOrganizationId!==actor.scope.organizationIds?.[0] ||
         cls.createdByPersonId===actor.actorPersonId ||
         !["approved","active"].includes(cls.state))
        throw new AuthorizationError("independent current Class policy authority");
      await validateClassAuthority(tx,{
        actor,organizationId:cls.operatingOrganizationId,siteIds:[cls.siteId],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const now=new Date();
      const [evidence]=await tx.select({
        owningOrganizationId:evidenceDocuments.owningOrganizationId,
        verifiedAt:evidenceDocumentVersions.verifiedAt,
        verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
        validFrom:evidenceDocumentVersions.validFrom,
        validThrough:evidenceDocumentVersions.validThrough,
      }).from(evidenceDocumentVersions)
        .innerJoin(evidenceDocuments,eq(
          evidenceDocuments.id,evidenceDocumentVersions.documentId))
        .where(eq(evidenceDocumentVersions.id,data.policyEvidenceVersionId))
        .limit(1);
      const today=now.toISOString().slice(0,10);
      if(!evidence || evidence.owningOrganizationId!==cls.operatingOrganizationId ||
         !evidence.verifiedAt || evidence.verifiedAt>now ||
         !evidence.verifiedByPersonId ||
         evidence.verifiedByPersonId===actor.actorPersonId ||
         evidence.verifiedByPersonId===cls.createdByPersonId ||
         (evidence.validFrom && evidence.validFrom>today) ||
         (evidence.validThrough && evidence.validThrough<today))
        throw new AuthorizationError("independent current provider policy evidence");
      const [latest]=await tx.select().from(classCompletionPolicyVersions)
        .where(eq(classCompletionPolicyVersions.classId,cls.id))
        .orderBy(desc(classCompletionPolicyVersions.versionNo)).limit(1);
      if((latest?.versionNo??null)!==data.expectedLatestVersion)
        throw new AuthorizationError("Class completion policy version changed");
      const effectiveAt=data.effectiveAt?new Date(data.effectiveAt):now;
      if(!Number.isFinite(effectiveAt.getTime()) ||
         effectiveAt.getTime()<now.getTime()-1000)
        throw new AuthorizationError("policy cannot be retroactively backdated");
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      const [created]=await tx.insert(classCompletionPolicyVersions).values({
        classId:cls.id,courseVersionId:cls.courseVersionId,
        versionNo:(latest?.versionNo??0)+1,
        requireAllLessons:data.requireAllLessons,
        requiredVerifiedSessions:data.requiredVerifiedSessions,
        requirePassingAssessment:data.requirePassingAssessment,
        effectiveAt,publishedAt:now,
        authoredByPersonId:cls.createdByPersonId,
        approvedByPersonId:actor.actorPersonId,
        approvedPolicyEvidenceVersionId:data.policyEvidenceVersionId,
      }).returning({id:classCompletionPolicyVersions.id,
        versionNo:classCompletionPolicyVersions.versionNo});
      if(!created)throw new Error("Class policy version was not published");
      const payload={
        contractVersion:1,classId:cls.id,courseVersionId:cls.courseVersionId,
        policyVersionId:created.id,versionNo:created.versionNo,
        evidenceVersionId:data.policyEvidenceVersionId,
        siteId:cls.siteId,operatingOrganizationId:cls.operatingOrganizationId,
        appliesTo:"future_enrollments",
      };
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,
        owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"learning.class.completion_policy_published",
        entityKind:"class_completion_policy_version",
        entityId:created.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,
        eventType:"ClassCompletionPolicyPublished",
        aggregateType:"class_completion_policy_version",
        aggregateId:created.id,payload,
      });
      return {policyVersionId:created.id,versionNo:created.versionNo,
        appliesTo:"future_enrollments" as const};
    });
  });
