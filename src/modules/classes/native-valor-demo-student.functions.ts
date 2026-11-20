import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassOfferingVersions,
  learnerCourseAttempts, participationAttributions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const VALOR_SITE = "f1000000-0000-4000-8000-000000000003";
const VALOR_ORG = "f1000000-0000-4000-8000-000000000002";
type Actor=Awaited<ReturnType<typeof getIdentityContext>>;
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

function noStore(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
function isValorStudent(actor:Actor){
  return actor.role==="student" &&
    !!actor.actorPersonId && !actor.sessionAccountId &&
    actor.grantSiteId===VALOR_SITE &&
    actor.scope.organizationIds?.length===1 &&
    actor.scope.organizationIds[0]===VALOR_ORG &&
    actor.capabilities.has("student:read");
}
async function verifyDemoStudent(tx:Tx,personId:string){
  const result=await tx.execute(sql`
    SELECT
      (SELECT metadata @> '{"synthetic":true}'::jsonb FROM public.sites WHERE id=${VALOR_SITE}::uuid) site_synthetic,
      (SELECT metadata @> '{"synthetic":true}'::jsonb FROM public.people WHERE id=${personId}::uuid) person_synthetic
  `);
  const row=result.rows[0] as {site_synthetic:boolean|null;person_synthetic:boolean|null}|undefined;
  if(!row?.site_synthetic || !row.person_synthetic)
    throw new AuthorizationError("synthetic Valor learner only");
}

export const getValorStudentClasses=createServerFn({method:"GET"})
  .handler(async()=>{
    noStore();
    let actor:Actor;
    try { actor=await getIdentityContext(getRequest()); }
    catch(error) {
      if(error instanceof AuthorizationError)return {kind:"other" as const,classes:[]};
      throw error;
    }
    if(!isValorStudent(actor))return {kind:"other" as const,classes:[]};
    return db.transaction(async tx=>{
      await verifyDemoStudent(tx,actor.actorPersonId!);
      const candidates=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.siteId,VALOR_SITE),
          eq(canonicalClasses.state,"active"))).limit(40);
      const classes=[];
      for(const c of candidates){
        try{ await currentClassAuthority(tx,c.id,new Date()); }
        catch(error){ if(error instanceof AuthorizationError)continue; throw error; }
        const active=await tx.select({
          id:canonicalClassEnrollments.id,status:canonicalClassEnrollments.status,
          courseAttemptId:canonicalClassEnrollments.courseAttemptId,
        }).from(canonicalClassEnrollments).where(and(
          eq(canonicalClassEnrollments.classId,c.id),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!),
          inArray(canonicalClassEnrollments.status,["active","pending"])
        )).limit(2);
        if(active.length>1)throw new AuthorizationError("ambiguous current demo enrollment");
        const [terms]=await tx.select({
          id:canonicalClassOfferingVersions.id,
          consentText:canonicalClassOfferingVersions.consentText,
          consentVersion:canonicalClassOfferingVersions.consentVersion,
          enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
        }).from(canonicalClassOfferingVersions).where(and(
          eq(canonicalClassOfferingVersions.classId,c.id),
          eq(canonicalClassOfferingVersions.state,"published"),
        )).limit(1);
        classes.push({
          classId:c.id,title:c.title,deliveryMode:c.deliveryMode,
          enrollmentId:active[0]?.id??null,
          status:active[0]?.status??"not_enrolled",
          courseAttemptId:active[0]?.courseAttemptId??null,
          canJoin:!!terms?.consentVersion && !!terms?.consentText &&
            terms.enrollmentMethods.includes("self"),
        });
      }
      classes.sort((a,b)=>a.title.localeCompare(b.title));
      return {kind:"student" as const,classes};
    });
  });

const input=z.object({
  classId:z.string().uuid(),
  consentAccepted:z.literal(true),
}).strict();

/** Only the literal synthetic Valor tenant can use student-side simulated
 * admission. This is never a legal consent or guardian-youth enrollment path.
 * Existing assigned pending fixtures are activated in-place, keeping history;
 * new registrations use published Class Offering terms and immutable consent.
 * Every participant still receives one genuine canonical Course Attempt. */
export const enrollInValorDemoClass=createServerFn({method:"POST"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    noStore();
    const request=getRequest();
    let actor=await getIdentityContext(request);
    if(!isValorStudent(actor)||!actor.actorPersonId||!actor.capabilities.has("assignments:submit"))
      throw new AuthorizationError("current direct Valor student membership");
    return db.transaction(async tx=>{
      const [c]=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.id,data.classId),
          eq(canonicalClasses.siteId,VALOR_SITE),
          eq(canonicalClasses.operatingOrganizationId,VALOR_ORG)))
        .for("update").limit(1);
      if(!c || c.state!=="active")throw new AuthorizationError("available synthetic Class");
      await verifyDemoStudent(tx,actor.actorPersonId!);
      await currentClassAuthority(tx,c.id,new Date());

      // Revalidate the current CAN session after the Class lock, never accept
      // identity, person or scope from the client request.
      actor=await getIdentityContext(request);
      if(!isValorStudent(actor))throw new AuthorizationError("current Valor student session");
      const [terms]=await tx.select().from(canonicalClassOfferingVersions)
        .where(and(eq(canonicalClassOfferingVersions.classId,c.id),
          eq(canonicalClassOfferingVersions.state,"published")))
        .limit(1);
      if(!terms || !terms.enrollmentMethods.includes("self") ||
          !terms.allowedCreditModes.includes("not_applicable") ||
          !terms.consentVersion || !terms.consentText ||
          (terms.opensAt && terms.opensAt>new Date()) ||
          (terms.closesAt && terms.closesAt<=new Date()))
        throw new AuthorizationError("open synthetic Class participation terms");
      const current=await tx.select().from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId,c.id),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!),
          inArray(canonicalClassEnrollments.status,["pending","active"])))
        .for("update").limit(2);
      if(current.length>1)throw new AuthorizationError("duplicate open Class enrollment");
      if(current[0]?.status==="active" && current[0].courseAttemptId)
        return {classId:c.id,classEnrollmentId:current[0].id,alreadyEnrolled:true};
      const [occupancy]=await tx.select({value:sql<number>`count(*)::int`})
        .from(canonicalClassEnrollments).where(and(
          eq(canonicalClassEnrollments.classId,c.id),
          inArray(canonicalClassEnrollments.status,["pending","active"])));
      if(!current.length && c.capacity!==null && (occupancy?.value??0)>=c.capacity)
        throw new AuthorizationError("no remaining demo Class seats");
      const prior=current[0];
      const digest=createHash("sha256").update(terms.consentVersion)
        .update("\u0000").update(terms.consentText).digest("hex");
      let enrollmentId:string;
      if(prior){
        if(prior.courseAttemptId)throw new AuthorizationError("pending enrollment needs reconciliation");
        enrollmentId=prior.id;
      } else {
        const [created]=await tx.insert(canonicalClassEnrollments).values({
          classId:c.id,classOfferingVersionId:terms.id,
          learnerPersonId:actor.actorPersonId!,enrolledByPersonId:actor.actorPersonId!,
          enrollmentMethod:"self",creditMode:"not_applicable",status:"active",
          consentVersion:terms.consentVersion,consentSha256:digest,consentedAt:new Date(),
        }).returning({id:canonicalClassEnrollments.id});
        if(!created)throw new Error("Class enrollment not created");
        enrollmentId=created.id;
        await tx.insert(participationAttributions).values({
          classEnrollmentId:enrollmentId,deliverySiteId:VALOR_SITE,
          reportingSiteId:VALOR_SITE,creditedOrganizationId:VALOR_ORG,
          attributionBasis:"provider_default",
          relationshipSnapshot:{synthetic:true,valorDemo:true},
        });
      }
      const [attempt]=await tx.insert(learnerCourseAttempts).values({
        classEnrollmentId:enrollmentId,enrollmentId:null,noncreditRegistrationId:null,
        deploymentId:c.deploymentId,adoptionId:c.adoptionId,
        offeringVersionId:c.offeringVersionId,courseVersionId:c.courseVersionId,
        sectionId:null,attemptNo:1,status:"active",
      }).returning({id:learnerCourseAttempts.id});
      if(!attempt)throw new Error("Course Attempt not created");
      await tx.update(canonicalClassEnrollments)
        .set({status:"active",courseAttemptId:attempt.id})
        .where(eq(canonicalClassEnrollments.id,enrollmentId));
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,owningOrganizationId:VALOR_ORG,
        eventCode:"valor.synthetic_student_enrolled",entityKind:"class_enrollment",
        entityId:enrollmentId,
        payload:{classId:c.id,courseAttemptId:attempt.id,synthetic:true,
          consentAcknowledged:true,preexistingAssignedEnrollment:!!prior,
          legalOrAcademicAuthorization:false},
      });
      return {classId:c.id,classEnrollmentId:enrollmentId,alreadyEnrolled:false};
    });
  });
