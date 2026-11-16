import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentAutoScores, assessmentDefinitions,
  assessmentExecutionAttempts, assessmentExecutionItems, assessmentExecutionResults,
  assessmentFormAdministrations, assessmentFormVersions, assessmentVersions,
  learnerCourseAttempts, canonicalClassEnrollments, canonicalClasses, canonicalPersons, learnerProfiles,
  auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError,assertCapability } from "@/domain/command-context";
import { evaluateKnowledgeCheckResult } from "@/domain/noncredit-knowledge-check";
import { validateClassAuthority } from "@/modules/classes/unified-class.functions";
import { getCanonicalClassPublisher } from "./native-class-publisher.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

const input=z.object({classEnrollmentId:z.string().uuid(),
  assessmentAttemptId:z.string().uuid()}).strict();

const pendingInput=z.object({classId:z.string().uuid()}).strict();

/** Per-Class provider queue, no raw answers or quiz keys. This query does not
 * infer permission from a teacher/facilitator or an audience display.
 */
export const getNativeClassPendingKnowledgeReviews=createServerFn({method:"GET"})
  .validator((raw:unknown)=>pendingInput.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("independent Class assessment reviewer");
    assertCapability(actor,"class.manage");
    assertCapability(actor,"noncredit.assessment.finalize");
    const organizationId=actor.scope.organizationIds?.[0];
    if(!organizationId||actor.scope.organizationIds?.length!==1)
      throw new AuthorizationError("single authorized provider");
    return db.transaction(async tx=>{
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).limit(1);
      if(!cls||cls.operatingOrganizationId!==organizationId||
        (cls.siteId&&!actor.scope.siteIds?.includes(cls.siteId))||
        (!cls.siteId&&cls.createdByPersonId!==actor.actorPersonId))
        throw new AuthorizationError("current exact operated Class");
      await validateClassAuthority(tx,{
        actor,organizationId,siteIds:actor.scope.siteIds??[],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const rows=await tx.select({
        classEnrollmentId:canonicalClassEnrollments.id,
        assessmentAttemptId:assessmentExecutionAttempts.id,
        firstName:canonicalPersons.legalFirstName,
        lastName:canonicalPersons.legalLastName,
        submittedAt:assessmentExecutionAttempts.submittedAt,
      }).from(assessmentExecutionAttempts)
        .innerJoin(assessmentAccess,eq(
          assessmentAccess.id,assessmentExecutionAttempts.accessGrantId))
        .innerJoin(learnerCourseAttempts,eq(
          learnerCourseAttempts.id,assessmentAccess.courseAttemptId))
        .innerJoin(canonicalClassEnrollments,and(
          eq(canonicalClassEnrollments.id,learnerCourseAttempts.classEnrollmentId),
          eq(canonicalClassEnrollments.courseAttemptId,learnerCourseAttempts.id)))
        .innerJoin(canonicalPersons,eq(
          canonicalPersons.id,canonicalClassEnrollments.learnerPersonId))
        .innerJoin(assessmentFormAdministrations,eq(
          assessmentFormAdministrations.id,assessmentExecutionAttempts.administrationId))
        .where(and(
          eq(canonicalClassEnrollments.classId,cls.id),
          eq(canonicalClassEnrollments.status,"active"),
          eq(assessmentExecutionAttempts.state,"scored"),
          eq(assessmentAccess.accessStatus,"approved"),
          eq(assessmentFormAdministrations.deploymentId,cls.deploymentId),
          eq(assessmentFormAdministrations.courseVersionId,cls.courseVersionId),
          eq(assessmentFormAdministrations.administeringOrganizationId,organizationId),
        )).orderBy(asc(assessmentExecutionAttempts.submittedAt)).limit(101);
      return {pending:rows.slice(0,100).map(r=>({
        classEnrollmentId:r.classEnrollmentId,
        assessmentAttemptId:r.assessmentAttemptId,
        learnerName:[r.firstName,r.lastName].filter(Boolean).join(" ")||"Learner",
        submittedAt:r.submittedAt?.toISOString()??null,
      })),partial:rows.length>100};
    });
  });

/** Independent provider review of a Class's EXISTING canonical assessment
 * result. Uses assessment_attempt_results and its database-owned result
 * integrity gate. Never records an academic grade, certificate, credential or
 * noncredit registration / completion decision.
 */
export const finalizeNativeClassKnowledgeCheck=createServerFn({method:"POST"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("authorized independent Class knowledge reviewer");
    assertCapability(actor,"class.manage");
    assertCapability(actor,"noncredit.assessment.finalize");
    const organizationId=actor.scope.organizationIds?.[0];
    if(!organizationId||actor.scope.organizationIds?.length!==1)
      throw new AuthorizationError("one provider organization");
    return db.transaction(async tx=>{
      const [enrollment]=await tx.select().from(canonicalClassEnrollments)
        .where(eq(canonicalClassEnrollments.id,data.classEnrollmentId)).limit(1);
      if(!enrollment?.courseAttemptId||enrollment.status!=="active"||
          enrollment.learnerPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent review of active Class learner");
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
      if(!cls||cls.operatingOrganizationId!==organizationId||
        cls.state!=="active"||
        (cls.siteId&&!actor.scope.siteIds?.includes(cls.siteId))||
        (!cls.siteId&&cls.createdByPersonId!==actor.actorPersonId))
        throw new AuthorizationError("exact current Class and operator");
      await validateClassAuthority(tx,{
        actor,organizationId,siteIds:actor.scope.siteIds??[],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const [course]=await tx.select().from(learnerCourseAttempts)
        .where(and(eq(learnerCourseAttempts.id,enrollment.courseAttemptId),
          eq(learnerCourseAttempts.classEnrollmentId,enrollment.id),
          eq(learnerCourseAttempts.status,"active"))).limit(1);
      if(!course||course.enrollmentId||course.noncreditRegistrationId||
         course.sectionId||course.deploymentId!==cls.deploymentId||
         course.courseVersionId!==cls.courseVersionId)
        throw new AuthorizationError("exact native Class Course Attempt");
      const [assessment]=await tx.select().from(assessmentExecutionAttempts)
        .where(eq(assessmentExecutionAttempts.id,data.assessmentAttemptId))
        .for("update").limit(1);
      if(!assessment)throw new AuthorizationError("existing canonical Class assessment attempt");
      const [grant]=await tx.select().from(assessmentAccess)
        .where(and(eq(assessmentAccess.id,assessment.accessGrantId),
          eq(assessmentAccess.courseAttemptId,course.id),
          eq(assessmentAccess.administrationId,assessment.administrationId)))
        .limit(1);
      const [learner]=await tx.select({id:learnerProfiles.id})
        .from(learnerProfiles)
        .where(eq(learnerProfiles.personId,enrollment.learnerPersonId)).limit(1);
      if(!grant||!learner||grant.learnerId!==learner.id||
         assessment.learnerId!==learner.id||grant.accessStatus!=="approved")
        throw new AuthorizationError("current personal canonical assessment grant");
      const [administration]=await tx.select().from(assessmentFormAdministrations)
        .where(eq(assessmentFormAdministrations.id,assessment.administrationId))
        .limit(1);
      if(!administration||administration.deploymentId!==cls.deploymentId||
          administration.courseVersionId!==cls.courseVersionId||
          administration.administeringOrganizationId!==organizationId||
          administration.proctorPolicy!=="none")
        throw new AuthorizationError("provider-owned Course assessment administration");
      const [version]=await tx.select().from(assessmentVersions)
        .where(eq(assessmentVersions.id,administration.assessmentVersionId)).limit(1);
      const [definition]=version?await tx.select().from(assessmentDefinitions)
        .where(eq(assessmentDefinitions.id,version.assessmentId)).limit(1):[];
      const [form]=await tx.select().from(assessmentFormVersions)
        .where(eq(assessmentFormVersions.id,assessment.formVersionId)).limit(1);
      const publisherOrganizationId=await getCanonicalClassPublisher(tx,{
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
      });
      if(!version||version.lifecycle!=="published"||
          version.courseVersionId!==cls.courseVersionId||!definition||
          definition.ownerOrganizationId!==publisherOrganizationId||
          !["formative","practice","readiness","mastery"].includes(definition.purpose)||
          !form||form.lifecycle!=="published"||form.shuffleQuestions||
          form.id!==administration.formVersionId||
          form.assessmentVersionId!==version.id)
        throw new AuthorizationError("published objective Course knowledge check");
      // Independent reviewer session is checked again inside the transaction,
      // including when the result was already finalized.
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      const [prior]=await tx.select().from(assessmentExecutionResults)
        .where(eq(assessmentExecutionResults.attemptId,assessment.id))
        .orderBy(desc(assessmentExecutionResults.resultRevision)).limit(1);
      if(assessment.state==="finalized"&&prior?.resultStatus==="finalized")
        return {resultId:prior.id,alreadyFinalized:true};
      if(assessment.state!=="scored"||!prior||prior.resultStatus!=="provisional"||
         prior.resultRevision!==1)
        throw new AuthorizationError("independently reviewable provisional Course assessment");
      const items=await tx.select().from(assessmentExecutionItems)
        .where(eq(assessmentExecutionItems.attemptId,assessment.id));
      const scores=items.length?await tx.select().from(assessmentAutoScores)
        .where(inArray(assessmentAutoScores.attemptItemId,items.map(item=>item.id))):[];
      if(!items.length||items.length!==scores.length||
         new Set(scores.map(row=>row.attemptItemId)).size!==items.length||
         scores.some(row=>row.scoringKind!=="automated"))
        throw new Error("Complete unambiguous canonical item scoring required");
      const total=items.reduce((sum,item)=>sum+Number(item.pointsAvailable),0);
      const earned=scores.reduce((sum,score)=>sum+Number(score.score),0);
      const evaluated=evaluateKnowledgeCheckResult(earned,total,
        form.passingFraction===null?null:Number(form.passingFraction));
      if(Number(prior.pointsEarned)!==earned||Number(prior.pointsPossible)!==total||
         prior.outcome!==evaluated.outcome)
        throw new Error("Canonical provisional result conflicts with item-level scoring");
      const [final]=await tx.insert(assessmentExecutionResults).values({
        attemptId:assessment.id,resultRevision:2,resultStatus:"finalized",
        pointsEarned:earned.toFixed(4),pointsPossible:total.toFixed(4),
        outcome:evaluated.outcome,reviewedByPersonId:actor.actorPersonId,
        supersedesId:prior.id,
        resultEvidence:{source:"class",reviewKind:"independent_provider_confirmation"},
      }).returning({id:assessmentExecutionResults.id});
      if(!final)throw new Error("Canonical result finalization failed");
      await tx.update(assessmentExecutionAttempts).set({state:"finalized"})
        .where(eq(assessmentExecutionAttempts.id,assessment.id));
      const payload={classEnrollmentId:enrollment.id,courseAttemptId:course.id,
        assessmentAttemptId:assessment.id,resultId:final.id,outcome:evaluated.outcome};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,owningOrganizationId:organizationId,
        eventCode:"class.assessment.finalized",
        entityKind:"assessment_attempt_result",entityId:final.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,eventType:"ClassKnowledgeCheckFinalized",
        aggregateType:"assessment_attempt_result",aggregateId:final.id,payload,
      });
      return {resultId:final.id,alreadyFinalized:false,outcome:evaluated.outcome,
        pointsEarned:earned,pointsPossible:total};
    });
  });
