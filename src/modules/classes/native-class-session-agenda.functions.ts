import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  assessmentDefinitions, assessmentVersions, auditEvents,
  canonicalClassEnrollments, canonicalClasses, canonicalClassSessions,
  canonicalDeliverySessions, courseLessons, courseVersions, domainEvents,
  facilitatedClassroomPlans, officialCourseAssignmentVersions,
} from "@/db/canonical-v301";
import { classSessionAgendaRevisions } from "@/db/canonical-v301/class-session-agendas";
import {
  assertClassSessionAgendaReferences, canPublishClassSessionAgenda,
  classSessionAgendaItemsSchema, type ClassSessionAgendaItem,
} from "@/domain/native-class-session-agenda";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { requireCanonicalFacilitator } from "@/modules/learning/canonical-facilitator-access.server";
import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { requireNativeClassSessionHost } from "./native-class-session-host.server";
import { assertCurrentNativeClassFacilitatorSession } from "./native-class-facilitator-session.server";

const uuid = z.string().uuid();
const readInput = z.object({classId:uuid,classSessionId:uuid}).strict();
const publishInput = readInput.extend({
  requestId:uuid,items:classSessionAgendaItemsSchema,
}).strict();

function requireAgendaFeature() {
  if (process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED !== "true" ||
      process.env.CAN_WS4_SESSION_AGENDAS_ENABLED !== "true")
    throw new AuthorizationError("Class Session agenda release not activated");
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Read-only approved Course inventory, intentionally never returning answers,
 * hidden assessment items, or a recorded teacher's per-learner selection. */
async function courseCatalog(tx:Tx, courseVersionId:string) {
  const [version]=await tx.select({
    lifecycle:courseVersions.lifecycle,publishedAt:courseVersions.publishedAt,
  }).from(courseVersions).where(eq(courseVersions.id,courseVersionId)).limit(1);
  if(version?.lifecycle!=="published"||!version.publishedAt)
    throw new AuthorizationError("published Course version");
  const lessons=await tx.select({
    id:courseLessons.id,title:courseLessons.title,
  }).from(courseLessons).where(eq(courseLessons.courseVersionId,courseVersionId))
    .orderBy(asc(courseLessons.lessonOrder)).limit(501);
  const assignments=await tx.select({
    id:officialCourseAssignmentVersions.id,
    title:officialCourseAssignmentVersions.assignmentKey,
  }).from(officialCourseAssignmentVersions)
    .where(eq(officialCourseAssignmentVersions.courseVersionId,courseVersionId))
    .orderBy(asc(officialCourseAssignmentVersions.assignmentKey)).limit(501);
  const assessments=await tx.select({
    id:assessmentVersions.id,title:assessmentDefinitions.title,
  }).from(assessmentVersions)
    .innerJoin(assessmentDefinitions,and(
      eq(assessmentDefinitions.id,assessmentVersions.assessmentId),
      eq(assessmentDefinitions.status,"active"),
    ))
    .where(and(eq(assessmentVersions.courseVersionId,courseVersionId),
      eq(assessmentVersions.lifecycle,"published")))
    .orderBy(asc(assessmentDefinitions.title)).limit(501);
  if(lessons.length>500||assignments.length>500||assessments.length>500)
    throw new AuthorizationError("Course inventory requires pagination");
  return {lessons,assignments,assessments};
}

async function linkedSession(tx:Tx,classId:string,classSessionId:string) {
  const [link]=await tx.select({
    id:canonicalClassSessions.id,
    courseVersionId:canonicalClasses.courseVersionId,
    planState:facilitatedClassroomPlans.state,
    facilitatorPersonId:canonicalClassSessions.facilitatorPersonId,
    startsAt:canonicalDeliverySessions.startsAt,
  }).from(canonicalClassSessions)
    .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassSessions.classId))
    .innerJoin(facilitatedClassroomPlans,and(
      eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId),
      eq(facilitatedClassroomPlans.deliverySessionId,canonicalClassSessions.deliverySessionId),
      eq(facilitatedClassroomPlans.courseVersionId,canonicalClasses.courseVersionId),
      eq(facilitatedClassroomPlans.deploymentId,canonicalClasses.deploymentId),
      eq(facilitatedClassroomPlans.siteId,canonicalClasses.siteId),
      eq(facilitatedClassroomPlans.hostOrganizationId,canonicalClasses.operatingOrganizationId),
    ))
    .innerJoin(canonicalDeliverySessions,and(
      eq(canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId),
      eq(canonicalDeliverySessions.deploymentId,canonicalClasses.deploymentId),
      eq(canonicalDeliverySessions.siteId,canonicalClasses.siteId),
    ))
    .where(and(eq(canonicalClassSessions.classId,classId),
      eq(canonicalClassSessions.id,classSessionId))).limit(1);
  if(!link) throw new AuthorizationError("exact authorized Class Session");
  return link;
}

function titledItems(items:readonly ClassSessionAgendaItem[], catalog:Awaited<ReturnType<typeof courseCatalog>>) {
  const names=new Map([
    ...catalog.lessons.map(x=>["lesson:"+x.id,x.title] as const),
    ...catalog.assignments.map(x=>["assignment:"+x.id,x.title] as const),
    ...catalog.assessments.map(x=>["assessment:"+x.id,x.title] as const),
  ]);
  return items.map(item=>({
    ...item,title:names.get((item.kind==="assignment"||item.kind==="assessment"
      ? item.kind:"lesson")+":"+item.referenceId)??"Content unavailable",
  }));
}

async function latestAgenda(tx:Tx,classSessionId:string) {
  const [latest]=await tx.select().from(classSessionAgendaRevisions)
    .where(eq(classSessionAgendaRevisions.classSessionId,classSessionId))
    .orderBy(desc(classSessionAgendaRevisions.revisionNo)).limit(1);
  return latest??null;
}

/** Permissions rechecked on every read. Being paired to a classroom is NOT
 * sufficient; learners must own an authorized native Class Course Attempt. */
export const getNativeClassSessionAgenda=createServerFn({method:"GET"})
  .validator((raw:unknown)=>readInput.parse(raw))
  .handler(async({data})=>{
    requireAgendaFeature();
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("verified Class Person");
    const host=actor.role==="learner"?null:await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const link=await linkedSession(tx,data.classId,data.classSessionId);
      let canEdit=false;
      if(actor.role==="learner"){
        assertCapability(actor,"learning.participate");
        const [member]=await tx.select({
          courseAttemptId:canonicalClassEnrollments.courseAttemptId,
          status:canonicalClassEnrollments.status,
        }).from(canonicalClassEnrollments).where(and(
          eq(canonicalClassEnrollments.classId,data.classId),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!),
          inArray(canonicalClassEnrollments.status,["active","completed"]),
        )).limit(1);
        if(!member?.courseAttemptId)throw new AuthorizationError("own active Class participation");
        const authorized=await authorizeCanonicalCourseAttempt(
          tx,actor,member.courseAttemptId,true,
        );
        if(authorized.source!=="class"||authorized.sectionId!==null||
          authorized.courseVersionId!==link.courseVersionId)
          throw new AuthorizationError("native Class Course Attempt");
      }else if(host){
        await requireNativeClassSessionHost(tx,host,data.classId,new Date());
        canEdit=link.facilitatorPersonId===actor.actorPersonId &&
          canPublishClassSessionAgenda({
            planState:link.planState,startsAt:link.startsAt,now:new Date(),
          });
      }
      const latest=await latestAgenda(tx,link.id);
      const catalog=await courseCatalog(tx,link.courseVersionId);
      const items=latest?classSessionAgendaItemsSchema.parse(latest.items):[];
      return {
        classId:data.classId,classSessionId:link.id,
        courseVersionId:link.courseVersionId,
        revisionNo:latest?.revisionNo??0,
        publishedAt:latest?.createdAt.toISOString()??null,
        startsAt:link.startsAt.toISOString(),
        items:titledItems(items,catalog),
        canEdit, // No permission to change Course versions or learner outcomes.
        options:canEdit?catalog:null,
        note:"Agenda references are not attendance, assessment access or verified completion.",
      };
    });
  });

/** Versioned, local-only planning. Exactly the assigned facilitator may
 * append a revision before the existing scheduled delivery window starts. */
export const publishNativeClassSessionAgenda=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    requireAgendaFeature();
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const now=new Date();
      const cls=await requireNativeClassSessionHost(tx,host,data.classId,now,true);
      await assertCurrentNativeClassFacilitatorSession(tx,host.actor);
      const link=await linkedSession(tx,cls.id,data.classSessionId);
      if(link.facilitatorPersonId!==host.actor.actorPersonId ||
         link.courseVersionId!==cls.courseVersionId)
        throw new AuthorizationError("only the assigned Class Session facilitator");
      // Exact request replay is safe, but a re-used ID cannot change content.
      const [retry]=await tx.select().from(classSessionAgendaRevisions)
        .where(and(eq(classSessionAgendaRevisions.classSessionId,link.id),
          eq(classSessionAgendaRevisions.requestId,data.requestId))).limit(1);
      if(retry){
        const previous=classSessionAgendaItemsSchema.parse(retry.items);
        if(JSON.stringify(previous)!==JSON.stringify(data.items))
          throw new AuthorizationError("Conflicting Session agenda retry");
        return {classSessionId:link.id,revisionNo:retry.revisionNo,duplicate:true};
      }
      if(!canPublishClassSessionAgenda({
        planState:link.planState,startsAt:link.startsAt,now,
      }))throw new AuthorizationError("future, unopened Class Session required");
      const catalog=await courseCatalog(tx,cls.courseVersionId);
      assertClassSessionAgendaReferences(data.items,{
        lessons:new Set(catalog.lessons.map(x=>x.id)),
        assignments:new Set(catalog.assignments.map(x=>x.id)),
        assessments:new Set(catalog.assessments.map(x=>x.id)),
      });
      const previous=await latestAgenda(tx,link.id);
      const revisionNo=(previous?.revisionNo??0)+1;
      const [saved]=await tx.insert(classSessionAgendaRevisions).values({
        classSessionId:link.id,courseVersionId:cls.courseVersionId,
        revisionNo,requestId:data.requestId,items:data.items,
        createdByPersonId:host.actor.actorPersonId!,
      }).returning({id:classSessionAgendaRevisions.id});
      if(!saved)throw new Error("Class Session agenda revision was not recorded");
      const payload={classId:cls.id,classSessionId:link.id,
        courseVersionId:cls.courseVersionId,revisionNo,agendaRevisionId:saved.id};
      await tx.insert(auditEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.session.agenda.published",
        entityKind:"class_session_agenda_revision",entityId:saved.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        eventType:"ClassSessionAgendaPublished",
        aggregateType:"class_session",aggregateId:link.id,payload,
      });
      return {classSessionId:link.id,revisionNo,duplicate:false};
    });
  });
