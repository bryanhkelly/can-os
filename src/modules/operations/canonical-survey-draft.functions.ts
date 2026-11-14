import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  surveyDefinitions, surveyVersions, surveyQuestions, surveyQuestionOptions,
  auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  canonicalSurveyDraftDatabaseRole, createSurveyDraftInput,
} from "@/domain/canonical-survey-draft";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const noStore = () => setResponseHeader("Cache-Control", "private, no-store");
async function surveyAuthor() {
  if (process.env.CAN_CANONICAL_SURVEY_DRAFT_ENABLED !== "true")
    throw new AuthorizationError("survey draft authoring not enabled");
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId || !["site_admin", "registrar"].includes(actor.role ?? "") ||
      !actor.scope.siteIds?.length) throw new AuthorizationError("canonical survey staff");
  const role = canonicalSurveyDraftDatabaseRole(actor);
  return { actorPersonId: actor.actorPersonId, organizationId: actor.scope.organizationIds![0]!, role };
}

export const readCanonicalSurveyDraftAccess = createServerFn({ method: "GET" }).handler(async () => {
  noStore();
  const author = await surveyAuthor();
  return { organizationId: author.organizationId };
});

/** Atomic append-only survey draft, not an invitation, publication or credential. */
export const createCanonicalSurveyDraft = createServerFn({ method: "POST" })
  .validator((raw: unknown) => createSurveyDraftInput.parse(raw))
  .handler(async ({ data }) => {
    noStore();
    const author = await surveyAuthor();
    return db.transaction(async tx => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${author.role}`));
      const binding = await tx.execute(sql`
        SELECT education_v30.v28_role_can_access_org(
          ${author.organizationId}::uuid, 'survey_draft_author') AS authorized
      `);
      if (binding.rows[0]?.authorized !== true)
        throw new AuthorizationError("bound survey draft writer role");
      const [definition] = await tx.insert(surveyDefinitions).values({
        ownerOrganizationId: author.organizationId, code: data.code,
        title: data.title, purposeCode: data.purposeCode,
        intendedAudience: data.intendedAudience, status: "active",
      }).returning({ id: surveyDefinitions.id });
      if (!definition) throw new Error("Survey definition not saved");
      const [version] = await tx.insert(surveyVersions).values({
        surveyId: definition.id, versionNo: 1, authorPersonId: author.actorPersonId,
        locale: "en-US", lifecycle: "draft", publishedAt: null,
      }).returning({ id: surveyVersions.id });
      if (!version) throw new Error("Survey draft not saved");
      for (const [index, item] of data.questions.entries()) {
        const [saved] = await tx.insert(surveyQuestions).values({
          surveyVersionId: version.id, questionKey: "question_" + (index + 1),
          promptText: item.prompt, ordinal: index + 1,
          questionType: item.type, required: item.required, safetyTriage: false,
          ratingMin: item.ratingMin, ratingMax: item.ratingMax,
        }).returning({ id: surveyQuestions.id });
        if (!saved) throw new Error("Survey question not saved");
        if (item.options.length) await tx.insert(surveyQuestionOptions).values(
          item.options.map((label, pos) => ({
            questionId: saved.id, optionKey: "option_" + (pos + 1),
            label, ordinal: pos + 1,
          })),
        );
      }
      const payload = {
        surveyId: definition.id, versionId: version.id,
        questionCount: data.questions.length, purposeCode: data.purposeCode,
      };
      await tx.insert(auditEvents).values({
        actorPersonId: author.actorPersonId, owningOrganizationId: author.organizationId,
        eventCode: "survey.draft.created", entityKind: "survey_version",
        entityId: version.id, payload,
      });
      await tx.insert(domainEvents).values({
        eventType: "SurveyDraftCreated", aggregateType: "survey_version",
        aggregateId: version.id, actorPersonId: author.actorPersonId, payload,
      });
      return {
        surveyId: definition.id, surveyVersionId: version.id,
        lifecycle: "draft" as const, questionCount: data.questions.length,
      };
    });
  });
