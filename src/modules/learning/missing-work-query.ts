import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions,
  assessments,
  communicationMessages,
  communicationThreads,
  insights,
  people,
  sections,
  studentProfiles,
  submissions,
} from "@/db/schema";
import type { CommandContext } from "@/domain/command-context";
import { assertStudentRead } from "@/policy/student-read";

export type AcademicInterventionCase = {
  submission: {
    id: string;
    status: string;
    timeliness: string;
    submittedAt: Date | null;
    gradedAt: Date | null;
    score: string | null;
  };
  assessment: {
    id: string;
    title: string;
    dueAt: Date | null;
    pointsPossible: string | null;
  };
  section: {
    id: string;
    title: string;
    code: string;
  };
  student: {
    studentProfileId: string;
    personId: string;
    displayName: string;
    gradeLevel: string | null;
  };
  insight: {
    id: string;
    status: string;
    title: string;
    summary: string;
    uncertainty: string | null;
  } | null;
  action: {
    id: string;
    status: string;
    title: string;
    description: string | null;
    dueAt: Date | null;
    resolutionNote: string | null;
  } | null;
  communication: {
    threadId: string;
    messages: Array<{
      id: string;
      senderPersonId: string;
      senderName: string;
      body: string;
      sentAt: Date;
    }>;
  } | null;
};

export async function getAcademicInterventionCase(
  context: CommandContext,
  submissionId: string,
): Promise<AcademicInterventionCase> {
  const [record] = await db
    .select({
      submissionId: submissions.id,
      submissionStatus: submissions.status,
      timeliness: submissions.timeliness,
      submittedAt: submissions.submittedAt,
      gradedAt: submissions.gradedAt,
      score: submissions.score,
      assessmentId: assessments.id,
      assessmentTitle: assessments.title,
      dueAt: assessments.dueAt,
      pointsPossible: assessments.pointsPossible,
      sectionId: sections.id,
      sectionTitle: sections.title,
      sectionCode: sections.code,
      studentProfileId: studentProfiles.id,
      studentPersonId: studentProfiles.personId,
      gradeLevel: studentProfiles.gradeLevel,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(sections, eq(sections.id, assessments.sectionId))
    .innerJoin(
      studentProfiles,
      eq(studentProfiles.id, submissions.studentProfileId),
    )
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!record) throw new Error("Submission not found");

  await assertStudentRead(context, record.studentProfileId);

  const [insight] = await db
    .select({
      id: insights.id,
      status: insights.status,
      title: insights.title,
      summary: insights.summary,
      uncertainty: insights.uncertainty,
    })
    .from(insights)
    .where(
      and(
        eq(insights.subjectType, "student_profile"),
        eq(insights.subjectId, record.studentProfileId),
        eq(insights.sectionId, record.sectionId),
        eq(insights.type, "missing_assignment"),
      ),
    )
    .orderBy(desc(insights.createdAt))
    .limit(1);

  const [action] = await db
    .select({
      id: actions.id,
      status: actions.status,
      title: actions.title,
      description: actions.description,
      dueAt: actions.dueAt,
      resolutionNote: actions.resolutionNote,
    })
    .from(actions)
    .where(
      and(
        eq(actions.subjectType, "student_profile"),
        eq(actions.subjectId, record.studentProfileId),
        eq(actions.sectionId, record.sectionId),
        eq(actions.type, "academic_intervention"),
      ),
    )
    .orderBy(desc(actions.createdAt))
    .limit(1);

  const [thread] = await db
    .select({ id: communicationThreads.id })
    .from(communicationThreads)
    .where(
      and(
        eq(communicationThreads.contextType, "submission"),
        eq(communicationThreads.contextId, record.submissionId),
      ),
    )
    .limit(1);

  let communication: AcademicInterventionCase["communication"] = null;

  if (thread) {
    const messageRows = await db
      .select({
        id: communicationMessages.id,
        senderPersonId: communicationMessages.senderPersonId,
        preferredName: people.preferredName,
        legalFirstName: people.legalFirstName,
        legalLastName: people.legalLastName,
        body: communicationMessages.body,
        sentAt: communicationMessages.sentAt,
      })
      .from(communicationMessages)
      .innerJoin(people, eq(people.id, communicationMessages.senderPersonId))
      .where(eq(communicationMessages.threadId, thread.id))
      .orderBy(asc(communicationMessages.sentAt));

    communication = {
      threadId: thread.id,
      messages: messageRows.map((message) => ({
        id: message.id,
        senderPersonId: message.senderPersonId,
        senderName:
          message.preferredName ??
          `${message.legalFirstName} ${message.legalLastName}`,
        body: message.body,
        sentAt: message.sentAt,
      })),
    };
  }

  return {
    submission: {
      id: record.submissionId,
      status: record.submissionStatus,
      timeliness: record.timeliness,
      submittedAt: record.submittedAt,
      gradedAt: record.gradedAt,
      score: record.score,
    },
    assessment: {
      id: record.assessmentId,
      title: record.assessmentTitle,
      dueAt: record.dueAt,
      pointsPossible: record.pointsPossible,
    },
    section: {
      id: record.sectionId,
      title: record.sectionTitle,
      code: record.sectionCode,
    },
    student: {
      studentProfileId: record.studentProfileId,
      personId: record.studentPersonId,
      displayName:
        record.preferredName ??
        `${record.legalFirstName} ${record.legalLastName}`,
      gradeLevel: record.gradeLevel,
    },
    insight: insight ?? null,
    action: action ?? null,
    communication,
  };
}
