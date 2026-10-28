/**
 * Classroom journey steps — teacher publishes real work, the enrolled student
 * submits actual content, the teacher grades it. Thin canonical-command
 * compositions shared by journeys that include instruction (A, C, E, F, H).
 */
import * as s from "@/db/schema";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import { first, type JourneyTools } from "./harness";
import type { JourneyPersona } from "./personas";
import type { JourneySchool } from "./school";

/** AccessContext for an enrolled learner. Not an account or grant by itself. */
export function studentActor(school: JourneySchool, studentPersonId: string): AccessContext {
  return {
    actorPersonId: studentPersonId,
    role: "student",
    accountId: crypto.randomUUID(),
    sessionId: `journey-student-${school.suffix}`,
    grantId: crypto.randomUUID(),
    grantSiteId: school.site.id,
    capabilities: new Set(roleCapabilities.student),
    scope: {
      organizationIds: [school.school.id],
      siteIds: [school.site.id],
      programIds: [school.program.id],
    },
  };
}

/** Real account, grant and session rows when a step verifies session state. */
export async function createStudentLogin(
  journey: JourneyTools,
  school: JourneySchool,
  studentPersonId: string,
) {
  const account = first(await journey.tx.insert(s.accessAccounts).values({
    emailNormalized: `journey-learner-${school.suffix}-${studentPersonId.slice(0, 8)}@example.test`,
    emailVerifiedAt: new Date(),
  }).returning());
  const grant = first(await journey.tx.insert(s.accountPersonGrants).values({
    accountId: account.id,
    personId: studentPersonId,
    role: "student",
    organizationId: school.school.id,
    siteId: school.site.id,
    active: true,
  }).returning());
  const login = first(await journey.tx.insert(s.accessSessions).values({
    accountId: account.id,
    activeGrantId: grant.id,
    secretHash: `journey-learning-synthetic-${school.suffix}`,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  }).returning());
  return { account, grant, login };
}

export async function publishJourneyAssessment(
  journey: JourneyTools,
  school: JourneySchool,
  teacher: JourneyPersona,
  input: { title: string; instructions: string; lessonId?: string; pointsPossible?: number; dueAt?: string },
) {
  const gradebook = await import("@/modules/learning/gradebook.functions");
  journey.setActor(teacher.actor);
  return gradebook.createAssessment({ data: {
    sectionId: school.section.id,
    title: input.title,
    instructions: input.instructions,
    assignmentKind: "classwork" as const,
    curriculumLessonId: input.lessonId ?? "solve-one",
    pointsPossible: input.pointsPossible ?? 10,
    dueAt: input.dueAt ?? new Date(Date.now() + 7 * 86400000).toISOString(),
    publishNow: true,
  } });
}

export async function submitJourneyWork(
  journey: JourneyTools,
  actor: AccessContext,
  input: { assessmentId: string; text: string },
) {
  const assignmentCommands = await import("@/modules/student-experience/assignments.functions");
  journey.setActor(actor);
  return assignmentCommands.saveAssignmentResponse({ data: {
    assessmentId: input.assessmentId,
    text: input.text,
  } });
}

export async function gradeJourneySubmission(
  journey: JourneyTools,
  teacher: JourneyPersona,
  input: { submissionId: string; score: number; feedbackComment: string },
) {
  const gradebook = await import("@/modules/learning/gradebook.functions");
  journey.setActor(teacher.actor);
  return gradebook.gradeSubmission({ data: input });
}
