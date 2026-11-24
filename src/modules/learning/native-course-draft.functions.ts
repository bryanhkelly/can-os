import { createHash } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalOfferingCourses,courseLessons,courseUnits,courses,courseVersions,
  offeringVersions,offerings,type JsonObject } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import {
  readEditableNativeLesson,saveNativeCourseLessonDraftSchema,
} from "@/domain/native-course-lesson-draft";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertTrackProvider } from "./instructional-track-access.server";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const noStore=()=>setResponseHeader("Cache-Control","private, no-store");
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor=Awaited<ReturnType<typeof getCommandContext>>;

const fingerprint=(title:string,content:unknown)=>createHash("sha256")
  .update(JSON.stringify({title,content},(_key,value:unknown)=>
    value!==null&&typeof value==="object"&&!Array.isArray(value)
      ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)))
      :value)).digest("hex");

async function requireAssignedNativeDraft(tx:Tx,actor:Actor,courseVersionId:string,
  lock=false){
  const query=tx.select({
    courseId:courses.id,courseTitle:courses.title,
    organizationId:courses.publisherOrganizationId,
    versionNo:courseVersions.versionNo,
  }).from(courseVersions)
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(eq(courseVersions.id,courseVersionId),
      eq(courseVersions.lifecycle,"draft"),
      sql`${courseVersions.syllabus}->>'supersededByCourseVersionId' IS NULL`));
  const [course]=await (lock?query.for("update"):query).limit(1);
  if(!course)throw new AuthorizationError("unpublished publisher Course draft");
  // An authenticated organization role is not a Course appointment.
  // This also verifies a live session, grant, professional appointment,
  // delegated capability and current independent evidence on every call.
  await assertTrackProvider(tx,actor,{
    organizationId:course.organizationId,courseId:course.courseId,
    capability:"instructional_track.author",
  });
  return course;
}

/** Only the appointed creator sees a native unpublished Course's lesson outline.
 * Neither a URL nor a Site Operator role grants publisher-edit rights. */
export const getNativeCourseDraftLessons=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseVersionId:uuid}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const course=await requireAssignedNativeDraft(tx,actor,data.courseVersionId);
      const rows=await tx.select({
        id:courseLessons.id,title:courseLessons.title,
        lessonOrder:courseLessons.lessonOrder,
        content:courseLessons.content,
        unitTitle:courseUnits.title,
        unitOrder:courseUnits.sequenceNo,
      }).from(courseLessons)
        .innerJoin(courseUnits,and(
          eq(courseUnits.id,courseLessons.courseUnitId),
          eq(courseUnits.courseVersionId,courseLessons.courseVersionId),
        ))
        .where(eq(courseLessons.courseVersionId,data.courseVersionId))
        .orderBy(asc(courseUnits.sequenceNo),asc(courseLessons.lessonOrder))
        .limit(81);
      return {
        courseVersionId:data.courseVersionId,
        courseTitle:course.courseTitle,versionNo:course.versionNo,
        limited:rows.length>80,
        lessons:rows.slice(0,80).map(row=>({
          id:row.id,title:row.title,unitTitle:row.unitTitle,
          lessonOrder:row.lessonOrder,
          revision:fingerprint(row.title,row.content),
          editable:readEditableNativeLesson(row.title,row.content),
        })),
      };
    });
  });

/** Optimistic, Course-scoped lesson editing. The canonical draft Course
 * version is locked against publication; lesson content is CAS guarded
 * against conflicting authors. No raw JSON or assessment keys accepted. */
export const saveNativeCourseLessonDraft=createServerFn({method:"POST"})
  .validator((value:unknown)=>saveNativeCourseLessonDraftSchema.parse(value))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const course=await requireAssignedNativeDraft(tx,actor,data.courseVersionId,true);
      const [lesson]=await tx.select({
        id:courseLessons.id,title:courseLessons.title,
        content:courseLessons.content,
      }).from(courseLessons)
        .where(and(eq(courseLessons.id,data.lessonId),
          eq(courseLessons.courseVersionId,data.courseVersionId)))
        .for("update").limit(1);
      if(!lesson)throw new AuthorizationError("lesson within this draft Course version");
      const original=readEditableNativeLesson(lesson.title,lesson.content);
      if(!original||!lesson.content||typeof lesson.content!=="object"||
        Array.isArray(lesson.content))
        throw new DomainError("VALIDATION_FAILED",
          "This Course lesson format requires the native curriculum editor.");
      const currentRevision=fingerprint(lesson.title,lesson.content);
      if(currentRevision!==data.expectedRevision)
        throw new DomainError("CONFLICT",
          "This Course lesson changed. Reload before saving.");
      const {title,objectives,segments}=data;
      const minutes=segments.reduce((sum,segment)=>sum+segment.minutes,0);
      const content:JsonObject={
        ...(lesson.content as JsonObject),
        objectives,segments,estimatedMinutes:minutes,
      };
      const nextRevision=fingerprint(title,content);
      if(nextRevision===currentRevision)
        return {revision:nextRevision,changed:false};
      await tx.update(courseLessons)
        .set({title,content})
        .where(and(eq(courseLessons.id,lesson.id),
          eq(courseLessons.courseVersionId,data.courseVersionId)));
      await writeAudit(tx,actor,{
        action:"curriculum.native_draft_lesson.save",
        entityType:"course_lesson",entityId:lesson.id,
        scope:{organizationId:course.organizationId},
        before:{courseVersionId:data.courseVersionId,
          title:lesson.title,revision:currentRevision},
        after:{courseVersionId:data.courseVersionId,title,
          revision:nextRevision,estimatedMinutes:minutes,
          independentPublicationRequired:true},
      });
      return {revision:nextRevision,changed:true};
    });
  });

/**
 * Publisher-scoped, read-only preflight for a private native Course draft.
 * This is deliberately separate from lesson editing: missing downstream
 * review permissions must not prevent an appointed author from saving content.
 * Rows show recorded statuses only, NEVER approval, site authority or readiness
 * to activate a Class. No mutation or publication capability is exposed here.
 */
export const getNativeCourseReleaseReadiness=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseVersionId:uuid}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const course=await requireAssignedNativeDraft(tx,actor,data.courseVersionId);
      const [lessonSummary]=await tx.select({count:count()}).from(courseLessons)
        .where(eq(courseLessons.courseVersionId,data.courseVersionId));
      // Publisher Course creators may inspect only their own Offering
      // composition. Partner Adoption, Deployment and Site records require
      // the separately verified local operator scope in Program Operations.
      const rows=await tx.select({
        offeringVersionId:offeringVersions.id,
        offeringTitle:offerings.title,
        versionNo:offeringVersions.versionNo,
        offeringLifecycle:offeringVersions.lifecycle,
        offeringPublishedAt:offeringVersions.publishedAt,
      }).from(canonicalOfferingCourses)
        .innerJoin(offeringVersions,eq(offeringVersions.id,
          canonicalOfferingCourses.offeringVersionId))
        .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
        .where(and(eq(canonicalOfferingCourses.courseVersionId,data.courseVersionId),
          eq(offerings.publisherOrganizationId,course.organizationId)))
        .limit(81);
      const offeringsForVersion=rows.slice(0,80).map(row=>({
        offeringVersionId:row.offeringVersionId,offeringTitle:row.offeringTitle,
        versionNo:row.versionNo,lifecycle:row.offeringLifecycle,
        published:row.offeringLifecycle==="published"&&!!row.offeringPublishedAt,
      }));
      return {
        courseVersionId:data.courseVersionId,courseTitle:course.courseTitle,
        versionNo:course.versionNo,courseLifecycle:"draft" as const,
        lessonCount:lessonSummary?.count??0,
        limited:rows.length>80,
        offerings:offeringsForVersion,
        // No Course release approval is inferred from lesson content or from
        // proposed Offering adoption. A publisher reviewer must complete the
        // separately governed native publication workflow.
        independentPublicationVerified:false,
        siteAndOperatorAuthorizationVerified:false,
      };
    });
  });
