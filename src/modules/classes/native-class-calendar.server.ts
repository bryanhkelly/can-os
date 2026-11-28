import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassEnrollments, canonicalClasses, canonicalClassSessions,
  canonicalDeliverySessions, facilitatedClassroomPlans, canonicalEnrollmentSites,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { resolveAuthorizedLearningPerson } from "@/modules/identity/authorized-learning-person.server";

export const calendarInput = z.object({classEnrollmentId:z.string().uuid()}).strict();

/** Authorized, on-demand snapshot for an adult learner's current Class.
 * It contains no roster or live-room pairing secrets, and never creates
 * another calendar source of truth or enrollment. */

export async function getMyNativeClassCalendarService(request:Request,data:z.infer<typeof calendarInput>){
    const {actor}=await resolveAuthorizedLearningPerson(request,"learning.participate");
    return db.transaction(async tx=>{
      const [enrollment]=await tx.select().from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.id,data.classEnrollmentId),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!),
          eq(canonicalClassEnrollments.status,"active"))).limit(1);
      if(!enrollment?.courseAttemptId)throw new AuthorizationError("active own Class enrollment");
      const access=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,true);
      if(access.source!=="class"||access.sectionId!==null)
        throw new AuthorizationError("native Class learner");
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
      if(!cls||cls.state!=="active"||!cls.siteId)
        throw new AuthorizationError("active Class and Site");
      const [site]=await tx.select({name:canonicalEnrollmentSites.name})
        .from(canonicalEnrollmentSites).where(eq(canonicalEnrollmentSites.id,cls.siteId)).limit(1);
      const sessions=await tx.select({
        sessionId:canonicalClassSessions.id,
        startsAt:canonicalDeliverySessions.startsAt,
        endsAt:canonicalDeliverySessions.endsAt,
      }).from(canonicalClassSessions)
        .innerJoin(facilitatedClassroomPlans,
          eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
        .innerJoin(canonicalDeliverySessions,
          eq(canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId))
        .where(and(eq(canonicalClassSessions.classId,cls.id),
          eq(facilitatedClassroomPlans.state,"scheduled"),
          gt(canonicalDeliverySessions.startsAt,new Date())))
        .orderBy(asc(canonicalDeliverySessions.startsAt)).limit(101);
      if(sessions.length>100)throw new Error("Class calendar exceeds export limit");
      return {
        classTitle:cls.title,siteName:site?.name??"CAN OS",
        sessions:sessions.map(row=>({
          id:row.sessionId,startsAt:row.startsAt.toISOString(),
          endsAt:row.endsAt.toISOString(),
        })),
      };
    });
}
