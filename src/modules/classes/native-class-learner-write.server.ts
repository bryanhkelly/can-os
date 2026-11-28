import {and,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {courseLessons} from "@/db/canonical-v301";
import {AuthorizationError,type CommandContext} from "@/domain/command-context";
import {authorizeNativeLearnerClass} from "./native-learner-class-access.server";
import {writeCanonicalAudit} from "@/platform/canonical-mutation.server";
import {asRecord} from "./native-class-homework-read.server";

const uuid=z.string().uuid();
export const lessonCompletionInput=z.object({classEnrollmentId:uuid,lessonId:uuid}).strict();
export const homeworkSubmissionInput=z.object({classEnrollmentId:uuid,assignmentId:uuid,responseText:z.string().trim().min(5).max(20000)}).strict();

/** Both transports use the same transaction, resource authority and evidence. */
export async function completeNativeClassLesson(actor:CommandContext,raw:unknown){
  const data=lessonCompletionInput.parse(raw);
    return db.transaction(async tx=>{
      const {cls,access}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write");
      const [lesson]=await tx.select({id:courseLessons.id})
        .from(courseLessons).where(and(eq(courseLessons.id,data.lessonId),
          eq(courseLessons.courseVersionId,cls.courseVersionId))).limit(1);
      if(!lesson)throw new AuthorizationError("lesson in this Course");
      const existing=await tx.execute(sql`
        SELECT id,status FROM public.learner_lesson_progress
        WHERE course_attempt_id=${access.courseAttemptId}::uuid
          AND lesson_id=${data.lessonId}::uuid FOR UPDATE
      `);
      const already=existing.rows[0] as {id:string;status:string}|undefined;
      if(already?.status==="completed"||already?.status==="waived")
        return {recorded:true,alreadyCompleted:true};
      if(already){
        await tx.execute(sql`
          UPDATE public.learner_lesson_progress
          SET status='completed',observed_at=now()
          WHERE id=${already.id}::uuid AND status IN ('not_started','in_progress')
        `);
      }else{
        await tx.execute(sql`
          INSERT INTO public.learner_lesson_progress
            (course_attempt_id,course_version_id,lesson_id,status)
          VALUES (${access.courseAttemptId}::uuid,${cls.courseVersionId}::uuid,
            ${data.lessonId}::uuid,'completed')
          ON CONFLICT (course_attempt_id,lesson_id) DO NOTHING
        `);
      }
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.lesson.milestone_completed",entityKind:"course_lesson",
        entityId:data.lessonId,payload:{classId:cls.id,courseAttemptId:access.courseAttemptId,
          masteryOrCredit:false},
      });
      return {recorded:true,alreadyCompleted:false};
    });
}

export async function submitNativeClassHomeworkCommand(actor:CommandContext,raw:unknown){
  const data=homeworkSubmissionInput.parse(raw);
    if(!(actor.role==="student"&&actor.capabilities.has("assignments:submit") ||
         actor.role==="learner"&&actor.capabilities.has("learning.participate")))
      throw new AuthorizationError("own homework submission capability");
    return db.transaction(async tx=>{
      const {enrollment,cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write");
      // Ordinary non-credit Class assignments may receive private, unscored
      // teacher feedback. This is determined by the current Enrollment's
      // credit mode, never by a synthetic Site/Person marker or demo email.
      const practiceOnly=enrollment.creditMode==="not_applicable";
      const responseValue=JSON.stringify({
        text:data.responseText,format:"text",
        ...(practiceOnly?{practiceResponse:true}:{}),
      });
      const assignment=await tx.execute(sql`
        SELECT a.id FROM public.graded_assignments a
        JOIN public.official_course_assignment_versions o
          ON o.id=a.official_assignment_version_id
         AND o.course_version_id=a.course_version_id
        WHERE a.id=${data.assignmentId}::uuid
          AND a.course_version_id=${cls.courseVersionId}::uuid
          AND a.section_id IS NULL
        LIMIT 1
      `);
      if(assignment.rows.length!==1)throw new AuthorizationError("homework in this exact Course");
      const previous=await tx.execute(sql`
        SELECT id,status,response FROM public.graded_submissions
        WHERE course_attempt_id=${courseAttemptId}::uuid
          AND assignment_id=${data.assignmentId}::uuid
        FOR UPDATE
      `);
      const prior=previous.rows[0] as {id:string;status:string;response:unknown}|undefined;
      if(prior){
        if(prior.status==="submitted"){
          if(asRecord(prior.response).text===data.responseText)
            return {submissionId:prior.id,alreadySubmitted:true};
          throw new AuthorizationError("already submitted; request a revision from your teacher");
        }
        if(prior.status!=="assigned" && prior.status!=="returned")
          throw new AuthorizationError("this submission cannot be edited");
        const next=await tx.execute(sql`
          UPDATE public.graded_submissions
          SET response=${responseValue}::jsonb,
              status='submitted',submitted_at=now()
          WHERE id=${prior.id}::uuid AND status IN ('assigned','returned')
          RETURNING id
        `);
        if(next.rows.length!==1)throw new AuthorizationError("submission changed; reload");
        await writeCanonicalAudit(tx,{
          actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
          eventCode:"class.homework.submitted",entityKind:"graded_submission",entityId:prior.id,
          payload:{classId:cls.id,assignmentId:data.assignmentId,courseAttemptId,revised:true},
        });
        return {submissionId:prior.id,alreadySubmitted:false};
      }
      const inserted=await tx.execute(sql`
        INSERT INTO public.graded_submissions
          (course_attempt_id,course_version_id,assignment_id,submitted_at,status,response)
        VALUES (${courseAttemptId}::uuid,${cls.courseVersionId}::uuid,
          ${data.assignmentId}::uuid,now(),'submitted',
          ${responseValue}::jsonb)
        ON CONFLICT (course_attempt_id,assignment_id) DO NOTHING
        RETURNING id
      `);
      const created=inserted.rows[0] as {id:string}|undefined;
      if(!created)throw new AuthorizationError("simultaneous homework submission; reload before retry");
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.homework.submitted",entityKind:"graded_submission",entityId:created.id,
        payload:{classId:cls.id,assignmentId:data.assignmentId,courseAttemptId,revised:false},
      });
      return {submissionId:created.id,alreadySubmitted:false};
    });
}
