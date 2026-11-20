import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassEnrollments, canonicalClasses,
  formativePracticeAttempts, formativePracticeResponses,
  courseUnits,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const VALOR_SITE = "f1000000-0000-4000-8000-000000000003";
const target = z.object({ classEnrollmentId: z.string().uuid() }).strict();
const submit = target.extend({
  assessmentVersionId: z.string().uuid(),
  answers: z.array(z.object({
    itemVersionId: z.string().uuid(),
    response: z.string().trim().min(3).max(4000),
  }).strict()).min(1).max(10),
}).strict();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = Awaited<ReturnType<typeof getInstructionalLearnerContext>>;

type DraftQuestionRow = {
  assessment_version_id: string;
  assessment_key: string;
  item_version_id: string;
  question_text: string;
  position: number;
};

function privateResult() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

/** A learner must own a current canonical Class Enrollment, not a Section. */
async function exactValorLearner(tx: Tx, actor: Actor, classEnrollmentId: string) {
  if (!actor.actorPersonId ||
      !(actor.role === "student" && actor.capabilities.has("student:read") ||
        actor.role === "learner" && actor.capabilities.has("learning.participate"))) {
    throw new AuthorizationError("authenticated Class learner");
  }
  const [enrollment] = await tx.select()
    .from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id, classEnrollmentId),
      eq(canonicalClassEnrollments.learnerPersonId, actor.actorPersonId),
      eq(canonicalClassEnrollments.status, "active"))).limit(1);
  if (!enrollment?.courseAttemptId) throw new AuthorizationError("current Class enrollment");
  const [cls] = await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id, enrollment.classId)).limit(1);
  if (!cls || cls.state !== "active" || cls.siteId !== VALOR_SITE ||
      cls.operatingOrganizationId !== "f1000000-0000-4000-8000-000000000002")
    throw new AuthorizationError("synthetic Valor Class");
  const syntheticRows = await tx.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM public.sites s JOIN public.people p
        ON p.id=${actor.actorPersonId}::uuid
      WHERE s.id=${cls.siteId}::uuid
        AND s.metadata @> '{"synthetic":true}'::jsonb
        AND p.metadata @> '{"synthetic":true}'::jsonb
    ) AS allowed
  `);
  if (syntheticRows.rows[0]?.allowed !== true) throw new AuthorizationError("synthetic demo only");
  if (actor.role === "student" && (!actor.scope.siteIds?.includes(VALOR_SITE) ||
      !actor.scope.organizationIds?.includes(cls.operatingOrganizationId)))
    throw new AuthorizationError("own synthetic Valor Site");

  const attempt = await authorizeCanonicalCourseAttempt(tx, actor, enrollment.courseAttemptId);
  if (attempt.source !== "class" || attempt.courseVersionId !== cls.courseVersionId)
    throw new AuthorizationError("own exact Class Course Attempt");
  return { cls, courseAttemptId: attempt.courseAttemptId };
}

/** Draft questions are *practice prompts*, not released assessment items.
 * Only text prompts are projected. Keys, rubrics and scoring are not queried.
 */
async function draftQuestions(tx: Tx, cls: typeof canonicalClasses.$inferSelect):
  Promise<DraftQuestionRow[]> {
  const result = await tx.execute(sql`
    SELECT av.id::text AS assessment_version_id,
      av.assessment_key,iv.id::text AS item_version_id,
      iv.item_prompt->>'text' AS question_text,fi.position
    FROM public.assessment_administrations aa
    JOIN public.assessment_versions av ON av.id=aa.assessment_version_id
    JOIN public.assessment_form_versions fv
      ON fv.id=aa.form_version_id AND fv.assessment_version_id=av.id
    JOIN public.assessment_form_items fi ON fi.form_version_id=fv.id
    JOIN public.assessment_item_versions iv ON iv.id=fi.item_version_id
    WHERE aa.course_version_id=${cls.courseVersionId}::uuid
      AND aa.deployment_id=${cls.deploymentId}::uuid
      AND aa.administering_organization_id=${cls.operatingOrganizationId}::uuid
      AND aa.status='draft' AND av.lifecycle='draft'
      AND fv.lifecycle='draft' AND iv.lifecycle='draft'
      AND iv.response_kind='short_text'
      AND aa.administration_code LIKE 'valor.demo.%.draft.preflight'
      AND (iv.item_prompt->>'synthetic')::boolean IS TRUE
    ORDER BY av.assessment_key,fi.position,iv.id
    LIMIT 11
  `);
  return result.rows as DraftQuestionRow[];
}

export const getNativeValorDraftPractice = createServerFn({ method: "GET" })
  .validator((value: unknown) => target.parse(value))
  .handler(async ({data}) => {
    privateResult();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const {cls, courseAttemptId} = await exactValorLearner(tx, actor, data.classEnrollmentId);
      const questions = await draftQuestions(tx, cls);
      // Only use a single synthetic assessment form for this exact Course.
      const versionIds = [...new Set(questions.map(item => item.assessment_version_id))];
      if (versionIds.length !== 1 || questions.length === 0 || questions.length > 10)
        return { available: false as const, questions: [], history: [] };
      const id = versionIds[0]!;
      const entries = await tx.select({
        id: formativePracticeAttempts.id,
        recordedAt: formativePracticeAttempts.recordedAt,
      }).from(formativePracticeAttempts)
        .where(eq(formativePracticeAttempts.courseAttemptId, courseAttemptId))
        .orderBy(asc(formativePracticeAttempts.recordedAt))
        .limit(100);
      const rows = entries.length ? await tx.select({
        practiceAttemptId: formativePracticeResponses.practiceAttemptId,
        response: formativePracticeResponses.response,
      }).from(formativePracticeResponses)
        .where(inArray(formativePracticeResponses.practiceAttemptId, entries.map(item => item.id)))
        : [];
      const saved = new Map(rows.map(item => [item.practiceAttemptId, item.response]));
      const history = entries.flatMap(item => {
        const value = saved.get(item.id);
        if (!value || value.synthetic !== true ||
            value.demoAssessmentVersionId !== id) return [];
        return [{ id: item.id, recordedAt: item.recordedAt.toISOString() }];
      });
      return {
        available: true as const, assessmentVersionId: id,
        questions: questions.map(item => ({
          id: item.item_version_id, prompt: item.question_text,
        })),
        history,
      };
    });
  });

/** Saves genuine learner answers in the existing private formative response
 * store. No assessment_access_grants, graded submissions, official scores,
 * grading_decisions, or Course completion are issued by this action.
 */
export const submitNativeValorDraftPractice = createServerFn({ method: "POST" })
  .validator((value: unknown) => submit.parse(value))
  .handler(async ({data}) => {
    privateResult();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const {cls, courseAttemptId} = await exactValorLearner(tx, actor, data.classEnrollmentId);
      const questions = await draftQuestions(tx, cls);
      if (!questions.length || questions.length > 10 ||
          questions.some(item => item.assessment_version_id !== data.assessmentVersionId)) {
        throw new AuthorizationError("exact synthetic Course practice questions");
      }
      const questionsById = new Map(questions.map(q => [q.item_version_id, q.question_text]));
      if (data.answers.length !== questionsById.size ||
          new Set(data.answers.map(a => a.itemVersionId)).size !== questionsById.size ||
          data.answers.some(a => !questionsById.has(a.itemVersionId))) {
        throw new AuthorizationError("complete synthetic practice responses");
      }
      const [unit] = await tx.select({ id: courseUnits.id }).from(courseUnits)
        .where(eq(courseUnits.courseVersionId, cls.courseVersionId))
        .orderBy(asc(courseUnits.id)).limit(1);
      if (!unit) throw new AuthorizationError("Course unit for private practice");
      const [practice] = await tx.insert(formativePracticeAttempts).values({
        courseAttemptId, courseVersionId: cls.courseVersionId,
        courseUnitId: unit.id, scoreNumeric: null,
      }).returning({ id: formativePracticeAttempts.id });
      if (!practice) throw new Error("Practice attempt unavailable");
      await tx.insert(formativePracticeResponses).values({
        practiceAttemptId: practice.id,
        response: {
          synthetic: true, practiceOnly: true,
          demoAssessmentVersionId: data.assessmentVersionId,
          responses: data.answers.map(answer => ({
            promptKey: answer.itemVersionId,
            promptText: questionsById.get(answer.itemVersionId)!,
            response: answer.response,
          })),
        },
      });
      await writeCanonicalAudit(tx, {
        actorPersonId: actor.actorPersonId!,
        owningOrganizationId: cls.operatingOrganizationId,
        eventCode: "class.synthetic_practice.submitted",
        entityKind: "formative_practice_attempt",
        entityId: practice.id,
        payload: {classId: cls.id, courseAttemptId, questionCount: questions.length,
          practiceOnly: true},
      });
      return { practiceAttemptId: practice.id, saved: true as const, practiceOnly: true as const };
    });
  });
