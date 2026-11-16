import { and, desc, eq, ne, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  learnerCourseAttempts, canonicalClassEnrollments, canonicalClasses,
  learnerProfiles, assessmentFormAdministrations, assessmentVersions,
  assessmentDefinitions, assessmentFormVersions, assessmentAccess,
  assessmentExecutionAttempts, learnerLessonProgress,
} from "@/db/canonical-v301";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import type { CanonicalParticipationAccess } from "@/domain/canonical-course-participation";
import { assertPublisherObjectiveAttemptLimit } from "@/domain/canonical-objective-draft";
import { getCanonicalClassPublisher } from "@/modules/classes/native-class-publisher.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Phase="baseline"|"final";

/**
 * Maps a native Class Course Attempt onto an EXISTING canonical assessment
 * administration and grant. This adds NO quiz tables, scoring algorithm,
 * teacher-controlled grades or noncredit registration impersonation.
 *
 * Publisher/operating organization chooses one independently approved
 * Course+Deployment administration per phase. Learner must have a
 * Person-bound grant; never auto-provision on a learner request.
 */
export async function loadNativeClassAssessmentScope(
  tx:Tx,context:CommandContext & {actorPersonId:string},
  access:CanonicalParticipationAccess,readHistory:boolean,phase:Phase,
){
  if(access.source!=="class"||access.sectionId!==null)
    throw new AuthorizationError("native Class Course Attempt");
  const [attempt]=await tx.select().from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.id,access.courseAttemptId)).limit(1);
  const [enrollment]=attempt?.classEnrollmentId?await tx.select()
    .from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id,attempt.classEnrollmentId),
      eq(canonicalClassEnrollments.learnerPersonId,context.actorPersonId))).limit(1):[];
  const [cls]=enrollment?await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,enrollment.classId)).limit(1):[];
  if(!attempt||!enrollment||!cls||!enrollment.courseAttemptId||
      enrollment.courseAttemptId!==attempt.id||
      cls.courseVersionId!==access.courseVersionId||
      cls.deploymentId!==access.deploymentId)
    throw new AuthorizationError("current Class learner and Course Attempt");
  const publisherOrganizationId=await getCanonicalClassPublisher(tx,{
    offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
  });
  const [profile]=await tx.select({id:learnerProfiles.id})
    .from(learnerProfiles).where(eq(learnerProfiles.personId,context.actorPersonId)).limit(1);
  if(!profile)throw new AuthorizationError("provider-issued canonical assessment learner identity");

  const administrations=await tx.select({
    administration:assessmentFormAdministrations,
    version:assessmentVersions,
    purpose:assessmentDefinitions.purpose,
  }).from(assessmentFormAdministrations)
    .innerJoin(assessmentVersions,eq(
      assessmentVersions.id,assessmentFormAdministrations.assessmentVersionId))
    .innerJoin(assessmentDefinitions,eq(
      assessmentDefinitions.id,assessmentVersions.assessmentId))
    .where(and(
      eq(assessmentFormAdministrations.deploymentId,access.deploymentId),
      eq(assessmentFormAdministrations.courseVersionId,access.courseVersionId),
      eq(assessmentFormAdministrations.administeringOrganizationId,cls.operatingOrganizationId),
      eq(assessmentFormAdministrations.proctorPolicy,"none"),
      readHistory?undefined:eq(assessmentFormAdministrations.status,"open"),
      eq(assessmentVersions.lifecycle,"published"),
      eq(assessmentVersions.courseVersionId,access.courseVersionId),
      // The national publisher owns the immutable assessment definition.
      // The local operator administers its approved Class deployment, not
      // an arbitrary different publisher's or locally altered answer key.
      eq(assessmentDefinitions.ownerOrganizationId,publisherOrganizationId),
    )).limit(51);
  if(administrations.length>50)
    throw new AuthorizationError("assessment administrations require a narrower Course publication");
  const phaseRows=administrations.filter(a=>phase==="baseline"?
    a.purpose==="diagnostic":
    ["formative","practice","readiness","mastery"].includes(a.purpose));
  if(phaseRows.length!==1)throw new AuthorizationError(
    "one approved Class Course assessment administration for this phase");
  const {administration,version}=phaseRows[0]!;
  assertPublisherObjectiveAttemptLimit(version.blueprint,administration.attemptLimit);
  const [form]=await tx.select().from(assessmentFormVersions)
    .where(and(eq(assessmentFormVersions.id,administration.formVersionId),
      eq(assessmentFormVersions.assessmentVersionId,version.id),
      eq(assessmentFormVersions.lifecycle,"published"))).limit(1);
  if(!form||form.shuffleQuestions)throw new AuthorizationError("fixed published canonical assessment form");
  const now=new Date();
  const grants=await tx.select().from(assessmentAccess)
    .where(and(eq(assessmentAccess.administrationId,administration.id),
      eq(assessmentAccess.courseAttemptId,access.courseAttemptId),
      eq(assessmentAccess.learnerId,profile.id))).limit(5);
  if(grants.length!==1)throw new AuthorizationError("unique provider-issued Class assessment grant");
  const activeGrant=grants.find(g=>g.accessStatus==="approved"&&
    g.validFrom<=now&&(!g.validThrough||g.validThrough>now)&&
    administration.status==="open"&&
    (!administration.opensAt||administration.opensAt<=now)&&
    (!administration.closesAt||administration.closesAt>now));
  const history=readHistory?await tx.select({grantId:assessmentExecutionAttempts.accessGrantId})
    .from(assessmentExecutionAttempts)
    .where(inArray(assessmentExecutionAttempts.accessGrantId,grants.map(g=>g.id)))
    .orderBy(desc(assessmentExecutionAttempts.createdAt)).limit(1):[];
  const grant=readHistory&&history.length?grants.find(g=>g.id===history[0]?.grantId):activeGrant;
  if(!grant)throw new AuthorizationError("current or historical personal assessment grant");
  let baselineLocked=false;
  if(phase==="baseline"){
    const [progress]=await tx.select({id:learnerLessonProgress.id})
      .from(learnerLessonProgress).where(and(
        eq(learnerLessonProgress.courseAttemptId,access.courseAttemptId),
        eq(learnerLessonProgress.status,"completed"),
      )).limit(1);
    const [prior]=await tx.select({id:assessmentExecutionAttempts.id})
      .from(assessmentExecutionAttempts)
      .innerJoin(assessmentAccess,eq(
        assessmentAccess.id,assessmentExecutionAttempts.accessGrantId))
      .where(and(
        eq(assessmentAccess.courseAttemptId,access.courseAttemptId),
        ne(assessmentExecutionAttempts.administrationId,administration.id),
      )).limit(1);
    baselineLocked=!!progress||!!prior;
  }
  const canStart=!baselineLocked&&enrollment.status==="active"&&
    attempt.status==="active"&&!!activeGrant;
  if(!readHistory&&!canStart)
    throw new AuthorizationError("open eligible Class assessment window");
  return {
    access,learnerId:profile.id,providerOrganizationId:cls.operatingOrganizationId,
    administration,form,grant,canStart,phase,assessmentVersionId:version.id,
  };
}
