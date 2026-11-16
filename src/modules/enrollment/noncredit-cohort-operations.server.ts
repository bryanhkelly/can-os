/** Server-only cohort authorization and atomic session-to-release linking.
 * These guards must not become part of a browser-importable server function facade. */
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, canonicalDeliverySessions, domainEvents, facilitatedClassroomPlans,
  noncreditSelfEnrollmentReleases } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

type Executor=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Never infer a participant's Site from account favorites or an operator's
 * other Site. A provider can view only its own releases at authorized Sites. */
export async function scopedRelease(tx:Executor,releaseId:string,lock=false){
  const provider=await requireCanonicalLabProvider();
  const query=tx.select().from(noncreditSelfEnrollmentReleases)
    .where(and(eq(noncreditSelfEnrollmentReleases.id,releaseId),
      eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId)))
    .limit(1);
  const [release]=lock?await query.for("update"):await query;
  if(!release || (release.siteId && !provider.siteIds.includes(release.siteId)))
    throw new AuthorizationError("own release at an authorized Site");
  // Every mutating operation requests the locked release. Recheck the
  // underlying login and grant in that same transaction before any write.
  if(lock)await assertCurrentCanonicalStaffForMutation(tx,getRequest(),provider.actor);
  return {provider,release};
}
type ScopedCohort=Awaited<ReturnType<typeof scopedRelease>>;
export async function assignCohortPlan(tx:Executor,scope:ScopedCohort,planId:string){
  const {provider,release}=scope;
  if(release.status!=="published"||release.deliveryMode!=="facilitated"||
    !release.siteId)throw new AuthorizationError("open facilitated release");
  const [plan]=await tx.select({
    id:facilitatedClassroomPlans.id,
    enrollmentReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    deploymentId:facilitatedClassroomPlans.deploymentId,
    courseVersionId:facilitatedClassroomPlans.courseVersionId,
    siteId:facilitatedClassroomPlans.siteId,
    hostOrganizationId:facilitatedClassroomPlans.hostOrganizationId,
    state:facilitatedClassroomPlans.state,
    startsAt:canonicalDeliverySessions.startsAt,
  }).from(facilitatedClassroomPlans)
    .innerJoin(canonicalDeliverySessions,eq(
      canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
    .where(eq(facilitatedClassroomPlans.id,planId))
    .limit(1).for("update",{of:facilitatedClassroomPlans});
  if(!plan||plan.deploymentId!==release.deploymentId||
    plan.courseVersionId!==release.courseVersionId||
    plan.siteId!==release.siteId||
    plan.hostOrganizationId!==provider.organizationId)
    throw new AuthorizationError("own scheduled Course at the exact approved Site");
  if(plan.enrollmentReleaseId===release.id)return {planId,attached:true,duplicate:true};
  if(plan.enrollmentReleaseId!==null||plan.state!=="scheduled"||
    plan.startsAt<=new Date())
    throw new AuthorizationError("unallocated future classroom meeting");
  await tx.update(facilitatedClassroomPlans).set({
    enrollmentReleaseId:release.id,updatedAt:new Date(),
  }).where(eq(facilitatedClassroomPlans.id,plan.id));
  const payload={releaseId:release.id,planId:plan.id,siteId:release.siteId};
  await tx.insert(auditEvents).values({
    actorPersonId:provider.actor.actorPersonId!,
    owningOrganizationId:provider.organizationId,
    eventCode:"noncredit.cohort.session_assigned",
    entityKind:"facilitated_classroom_plan",entityId:plan.id,payload,
  });
  await tx.insert(domainEvents).values({
    eventType:"NoncreditCohortSessionAssigned",
    aggregateType:"noncredit_self_enrollment_release",
    aggregateId:release.id,actorPersonId:provider.actor.actorPersonId!,
    payload,
  });
  return {planId,attached:true,duplicate:false};
}
