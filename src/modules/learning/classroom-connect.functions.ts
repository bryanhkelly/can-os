import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courses, courseVersions, enrollments, learnerCourseAttempts,
  learnerProfiles, noncreditRegistrations,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";

/**
 * Read-only companion to canonical pairing. The list is scoped to the signed-in
 * learner's own Course attempts, never to rooms or a raw join code. The chosen
 * attempt is independently reauthorized by pairWithFacilitatedRoom.
 */
export const getClassroomConnectCourseChoices = createServerFn({ method: "GET" })
  .handler(async () => {
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getInstructionalLearnerContext(getRequest());
    if (!actor.actorPersonId || !["student", "learner"].includes(actor.role ?? "")) {
      throw new AuthorizationError("authenticated course learner");
    }
    return db.transaction(async tx => {
      const common = {
        courseAttemptId: learnerCourseAttempts.id,
        courseTitle: courses.title,
        courseVersionId: learnerCourseAttempts.courseVersionId,
      };
      const school = await tx.select(common).from(learnerCourseAttempts)
        .innerJoin(enrollments, eq(learnerCourseAttempts.enrollmentId, enrollments.id))
        .innerJoin(learnerProfiles, eq(enrollments.learnerId, learnerProfiles.id))
        .innerJoin(courseVersions, eq(learnerCourseAttempts.courseVersionId, courseVersions.id))
        .innerJoin(courses, eq(courseVersions.courseId, courses.id))
        .where(and(
          eq(learnerProfiles.personId, personId),
          eq(enrollments.status, "active"),
          eq(learnerCourseAttempts.status, "active"),
        ))
        .orderBy(desc(learnerCourseAttempts.startedAt)).limit(30);
      const noncredit = await tx.select(common).from(learnerCourseAttempts)
        .innerJoin(noncreditRegistrations,
          eq(learnerCourseAttempts.noncreditRegistrationId, noncreditRegistrations.id))
        .innerJoin(courseVersions, eq(learnerCourseAttempts.courseVersionId, courseVersions.id))
        .innerJoin(courses, eq(courseVersions.courseId, courses.id))
        .where(and(
          eq(noncreditRegistrations.participantPersonId, personId),
          inArray(noncreditRegistrations.status, ["registered", "active"]),
          eq(learnerCourseAttempts.status, "active"),
        ))
        .orderBy(desc(learnerCourseAttempts.startedAt)).limit(30);
      const choices = new Map<string, { courseAttemptId: string; courseTitle: string }>();
      for (const candidate of [...school, ...noncredit]) {
        if (choices.has(candidate.courseAttemptId)) continue;
        try {
          await authorizeCanonicalCourseAttempt(tx, actor, candidate.courseAttemptId);
          choices.set(candidate.courseAttemptId, {
            courseAttemptId: candidate.courseAttemptId,
            courseTitle: candidate.courseTitle,
          });
        } catch (error) {
          if (!(error instanceof AuthorizationError) && !(error instanceof DomainError)) throw error;
        }
      }
      return { choices: [...choices.values()], notice: "Pairing never creates attendance or a completion record." };
    });
  });
