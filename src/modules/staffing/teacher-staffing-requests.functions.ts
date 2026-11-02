import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

function requireIsolatedTeacherPreview() {
  if (process.env.CAN_DEMO_TEACHER_PREVIEW_ENABLED !== "true" ||
      process.env.CAN_DEMO_ISOLATED_ENV !== "true") {
    throw new AuthorizationError("CAN demo teacher requests require an isolated demonstration environment");
  }
}
type TeacherSelection = z.infer<typeof requestSchema>;
function selectionMetadata(data: TeacherSelection) {
  return {
    requestOrigin: "can_teacher_marketplace",
    courseVersionId: data.courseVersionId,
    teacherPersonId: data.teacherPersonId,
    sectionId: data.sectionId ?? null,
    syntheticPreview: true,
    staffingAuthorization: "not_granted",
  };
}
function sameSelection(saved: Record<string, unknown>, expected: ReturnType<typeof selectionMetadata>) {
  return saved.requestOrigin === expected.requestOrigin &&
    saved.courseVersionId === expected.courseVersionId &&
    saved.teacherPersonId === expected.teacherPersonId &&
    (saved.sectionId ?? null) === expected.sectionId &&
    saved.syntheticPreview === true;
}
async function authorizedSchoolSelection(programId: string) {
  requireIsolatedTeacherPreview();
  const actor = await requireActor(["registrar"], "program.launch.start");
  if (!actor.scope.programIds?.includes(programId))
    throw new AuthorizationError("school staffing program scope");
  const market = await readMarketplace(actor, programId);
  const adopted = market.packs.filter(pack => pack.entitlement === "active" &&
    pack.adoption?.status === "active" && pack.adoption.versionId === pack.versionId);
  const versionIds = new Set(adopted.flatMap(pack => pack.courses.map(course => course.courseVersionId)));
  return { actor, market, versionIds };
}

/** Record a school administrator's selected CAN demo teacher as a request,
 * not a Section, credential, capacity reservation, or teaching assignment.
 * The existing launch staffing service remains the sole assignment path.
 */
export const requestDemoTeacherStaffing = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { actor, market, versionIds } = await authorizedSchoolSelection(data.programId);
    if (!versionIds.has(data.courseVersionId))
      throw new AuthorizationError("staffing requests require an adopted course version");
    const metadata = selectionMetadata(data);
    return db.transaction(async tx => {
      const [school] = await tx.select({
        organizationId: programs.organizationId, siteId: programs.siteId,
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
      // Server-side capability, membership, ownership, and demo-only offering
      // checks prevent forging a Person ID or selecting a different publisher.
      const [match] = await tx.select({ personId: people.id })
        .from(courseTemplateVersions)
        .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
        .innerJoin(instructorCapabilities, eq(instructorCapabilities.courseTemplateId, courseTemplates.id))
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
          eq(people.active, true),
          eq(instructorCapabilities.active, true),
          eq(instructorAvailabilityWindows.active, true),
          eq(instructionalCapacityOfferings.status, "open"),
          eq(organizations.slug, "can-demo-teaching-provider"),
          sql`${organizations.metadata}->>'demoProvider' = 'true'`,
          sql`${organizations.metadata}->>'isSynthetic' = 'true'`,
          sql`${instructionalCapacityOfferings.metadata}->>'previewOnly' = 'true'`,
          sql`${people.metadata}->>'sourceSystem' = 'can-demo-teacher-marketplace-factory'`,
        )).limit(1);
      if (!match) throw new AuthorizationError("selected instructor is not a CAN demo marketplace candidate");
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
        description: "School requested CAN review of an illustrative teacher match. No assignment or clearance is implied.",
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
export const listDemoTeacherStaffingRequests = createServerFn({ method: "GET" })
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
        createdAt: row.createdAt.toISOString(),
      })) };
  });
