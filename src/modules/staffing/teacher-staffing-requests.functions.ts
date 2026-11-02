import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  actions, courseTemplates, courseTemplateVersions, instructorCapabilities,
  instructionalCapacityOfferings, instructorAvailabilityWindows, memberships, organizations, people, programs, sections,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "@/modules/learning/curriculum-marketplace.server";
import { emitEvent } from "@/platform/mutation";

const uuid = z.string().uuid();
const scope = z.object({ programId: uuid }).strict();
const requestSchema = scope.extend({
  requestId: uuid,
  courseVersionId: uuid,
  teacherPersonId: uuid,
  sectionId: uuid.optional(),
}).strict();

type TeacherSelection = z.infer<typeof requestSchema>;
function selectionMetadata(data: TeacherSelection, isSynthetic: boolean) {
  return {
    requestOrigin: "can_teacher_marketplace",
    courseVersionId: data.courseVersionId,
    teacherPersonId: data.teacherPersonId,
    sectionId: data.sectionId ?? null,
    isSynthetic,
    staffingAuthorization: "not_granted",
  };
}
function sameSelection(saved: Record<string, unknown>, expected: ReturnType<typeof selectionMetadata>) {
  return saved.requestOrigin === expected.requestOrigin &&
    saved.courseVersionId === expected.courseVersionId &&
    saved.teacherPersonId === expected.teacherPersonId &&
    (saved.sectionId ?? null) === expected.sectionId &&
    saved.isSynthetic === expected.isSynthetic;
}
async function authorizedSchoolSelection(programId: string) {
  const actor = await requireActor(["registrar"], "program.launch.start");
  if (!actor.scope.programIds?.includes(programId))
    throw new AuthorizationError("school staffing program scope");
  const market = await readMarketplace(actor, programId);
  const adopted = market.packs.filter(pack => pack.entitlement === "active" &&
    pack.adoption?.status === "active" && pack.adoption.versionId === pack.versionId);
  const versionIds = new Set(adopted.flatMap(pack => pack.courses.map(course => course.courseVersionId)));
  return { actor, market, versionIds };
}

/** Record a school administrator's selected CAN-managed teacher as a request,
 * not a Section, credential, capacity reservation, or teaching assignment.
 * The existing launch staffing service remains the sole assignment path.
 */
export const requestTeacherStaffing = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { actor, market, versionIds } = await authorizedSchoolSelection(data.programId);
    if (!versionIds.has(data.courseVersionId))
      throw new AuthorizationError("staffing requests require an adopted course version");
    return db.transaction(async tx => {
      const [school] = await tx.select({
        organizationId: programs.organizationId, siteId: programs.siteId,
        academicProviderOrganizationId: programs.academicProviderOrganizationId,
        jurisdictionId: programs.jurisdictionId,
      }).from(programs).where(eq(programs.id, data.programId)).limit(1);
      if (!school?.siteId || school.siteId !== market.program.siteId ||
          !actor.scope.organizationIds?.includes(school.organizationId) ||
          !actor.scope.siteIds?.includes(school.siteId))
        throw new AuthorizationError("school staffing site and organization scope");
      if (data.sectionId) {
        const [klass] = await tx.select({
          id: sections.id,
        }).from(sections).where(and(
          eq(sections.id, data.sectionId),
          eq(sections.programId, data.programId),
          eq(sections.siteId, school.siteId),
          eq(sections.courseTemplateVersionId, data.courseVersionId),
          eq(sections.active, true),
        )).limit(1);
        if (!klass) throw new AuthorizationError("class must belong to the selected school course");
      }
      // Server-side capability and provider checks prevent forging a Person ID
      // or choosing an instructor that CAN has not put on this marketplace.
      const [match] = await tx.select({
        personId: people.id, providerId: organizations.id,
        providerMetadata: organizations.metadata, courseMetadata: courseTemplates.metadata,
        offeringMetadata: instructionalCapacityOfferings.metadata,
      })
        .from(courseTemplateVersions)
        .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
        .innerJoin(instructorCapabilities, or(
          eq(instructorCapabilities.courseTemplateId, courseTemplates.id),
          and(isNull(instructorCapabilities.courseTemplateId), eq(instructorCapabilities.subject, courseTemplates.subject)),
        ))
        .innerJoin(people, eq(people.id, instructorCapabilities.personId))
        .innerJoin(memberships, eq(memberships.personId, people.id))
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .innerJoin(instructionalCapacityOfferings,
          and(eq(instructionalCapacityOfferings.personId, people.id),
            eq(instructionalCapacityOfferings.capabilityId, instructorCapabilities.id)))
        .innerJoin(instructorAvailabilityWindows,
          eq(instructorAvailabilityWindows.id, instructionalCapacityOfferings.availabilityWindowId))
        .where(and(
          eq(courseTemplateVersions.id, data.courseVersionId),
          eq(people.id, data.teacherPersonId),
          or(isNull(instructionalCapacityOfferings.organizationId), eq(instructionalCapacityOfferings.organizationId, school.organizationId)),
          or(isNull(instructionalCapacityOfferings.siteId), eq(instructionalCapacityOfferings.siteId, school.siteId)),
          or(isNull(instructionalCapacityOfferings.programId), eq(instructionalCapacityOfferings.programId, data.programId)),
          or(isNull(instructionalCapacityOfferings.jurisdictionId), eq(instructionalCapacityOfferings.jurisdictionId, school.jurisdictionId)),
          gte(instructorAvailabilityWindows.endsAt, new Date()),
          eq(people.active, true),
          eq(instructorCapabilities.active, true),
          eq(instructorAvailabilityWindows.active, true),
          eq(instructionalCapacityOfferings.status, "open"),
          or(
            and(eq(organizations.id, school.academicProviderOrganizationId),
              sql`coalesce(${organizations.metadata}->>'isSynthetic', 'false') <> 'true'`,
              sql`coalesce(${instructionalCapacityOfferings.metadata}->>'previewOnly', 'false') <> 'true'`),
            and(
              sql`${courseTemplates.metadata}->>'sourceSystem' = 'can-demo-catalog-factory'`,
              sql`${organizations.metadata}->>'demoProvider' = 'true'`,
              sql`${organizations.metadata}->>'isSynthetic' = 'true'`,
              sql`${instructionalCapacityOfferings.metadata}->>'previewOnly' = 'true'`,
            ),
          ),
        )).limit(1);
      if (!match) throw new AuthorizationError("selected instructor is not an eligible CAN marketplace candidate");
      const isSynthetic = match.providerMetadata.isSynthetic === true;
      const metadata = selectionMetadata(data, isSynthetic);
      // Serialize same-course/teacher/school requests, including requests for
      // the same specific class, to prevent duplicate clicks/concurrent clients.
      const selectionKey = [data.programId,data.courseVersionId,data.teacherPersonId,data.sectionId ?? "course"].join(":");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"can-teacher-request:"+selectionKey}))`);
      const existingRequests = await tx.select({
        id: actions.id, metadata: actions.metadata, status: actions.status,
      }).from(actions).where(and(
        eq(actions.type, "teacher_staffing_request"),
        eq(actions.programId, data.programId),
        eq(actions.organizationId, school.organizationId),
        eq(actions.siteId, school.siteId),
        eq(actions.status, "open"),
      ));
      const matching = existingRequests.find(row => sameSelection(row.metadata, metadata));
      if (matching) return { requestId: matching.id, replayed: true, status: "open" as const };
      const course = market.packs.flatMap(pack => pack.courses)
        .find(item => item.courseVersionId === data.courseVersionId);
      const [created] = await tx.insert(actions).values({
        id: data.requestId,
        type: "teacher_staffing_request", status: "open", priority: "normal",
        title: "CAN instructor request: " + (course?.title ?? "Selected course"),
        description: "School requested CAN instructor staffing review. No assignment or clearance is implied.",
        ownerPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId,
        programId: data.programId, sectionId: data.sectionId ?? null,
        subjectType: "program", subjectId: data.programId,
        metadata,
      }).onConflictDoNothing().returning({ id: actions.id });
      if (!created) {
        const [previous] = await tx.select().from(actions)
          .where(eq(actions.id, data.requestId)).limit(1);
        if (!previous || previous.type !== "teacher_staffing_request" ||
            previous.programId !== data.programId ||
            previous.ownerPersonId !== actor.actorPersonId ||
            previous.status !== "open" || !sameSelection(previous.metadata, metadata))
          throw new Error("Request identifier was already used for another command");
        return { requestId: previous.id, replayed: true, status: "open" as const };
      }
      await recordAudit(tx, actor, {
        action: "can_teacher_marketplace.request",
        resourceType: "action", resourceId: created.id,
        scope: { organizationId: school.organizationId, siteId: school.siteId, programId: data.programId },
        after: metadata,
      });
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated, aggregateType: "action",
        aggregateId: created.id, actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: data.programId,
        payload: { kind: "teacher_staffing_request", courseVersionId: data.courseVersionId },
      });
      return { requestId: created.id, replayed: false, status: "open" as const };
    });
  });

/** The registrar sees only requests for an authorized school, never a
 * provider-wide teacher directory or requests for unrelated church schools.
 */
export const listTeacherStaffingRequests = createServerFn({ method: "GET" })
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, market } = await authorizedSchoolSelection(data.programId);
    if (!market.program.siteId) return { requests: [] };
    const rows = await db.select({
      id: actions.id, status: actions.status,
      metadata: actions.metadata, createdAt: actions.createdAt,
    }).from(actions).where(and(
      eq(actions.type, "teacher_staffing_request"),
      eq(actions.programId, data.programId),
      inArray(actions.organizationId, actor.scope.organizationIds ?? []),
      eq(actions.siteId, market.program.siteId),
      inArray(actions.status, ["open", "resolved", "cancelled"]),
    )).orderBy(desc(actions.createdAt)).limit(100);
    return { requests: rows.filter(row => row.metadata.requestOrigin === "can_teacher_marketplace")
      .map(row => ({
        requestId: row.id, status: row.status,
        courseVersionId: String(row.metadata.courseVersionId ?? ""),
        teacherPersonId: String(row.metadata.teacherPersonId ?? ""),
        sectionId: typeof row.metadata.sectionId === "string" ? row.metadata.sectionId : null,
        reviewState: row.status === "cancelled" ? "declined" as const :
          row.metadata.canStaffingReviewState === "in_review" ? "in_review" as const :
          row.status === "resolved" ? "resolved" as const : "requested" as const,
        declineReason: row.status === "cancelled" && typeof row.metadata.canStaffingDeclineReason === "string"
          ? row.metadata.canStaffingDeclineReason : null,
        createdAt: row.createdAt.toISOString(),
      })) };
  });
