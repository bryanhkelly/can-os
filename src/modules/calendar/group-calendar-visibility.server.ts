import { and, eq, exists, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type { Actor } from "@/modules/identity/actors.server";

export async function visibleStudyGroupCalendarEventIds(
  actor: Actor,
  siteIds: readonly string[],
  sectionIds: readonly string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<string[]> {
  if (!siteIds.length) return [];

  const visibility =
    actor.role === "teacher"
      ? and(
          eq(schema.studyGroups.facilitatorPersonId, actor.actorPersonId),
          or(
            isNull(schema.studyGroups.programId),
            inArray(schema.studyGroups.programId, actor.scope.programIds ?? []),
          ),
          or(
            isNull(schema.studyGroups.sectionId),
            and(
              inArray(schema.studyGroups.sectionId, [...sectionIds]),
              exists(db
                .select({ id: schema.sections.id })
                .from(schema.sections)
                .where(and(
                  eq(schema.sections.id, schema.studyGroups.sectionId),
                  eq(schema.sections.active, true),
                ))),
            ),
          ),
        )
      : actor.role === "student"
        ? (() => {
            const approvedMembership = db
              .select({ id: schema.studyGroupMemberships.id })
              .from(schema.studyGroupMemberships)
              .where(and(
                eq(schema.studyGroupMemberships.groupId, schema.studyGroups.id),
                eq(schema.studyGroupMemberships.personId, actor.actorPersonId),
                eq(schema.studyGroupMemberships.status, "approved"),
              ));

            const activeProgramEnrollment = db
              .select({ id: schema.enrollments.id })
              .from(schema.studentProfiles)
              .innerJoin(
                schema.enrollments,
                eq(schema.enrollments.studentProfileId, schema.studentProfiles.id),
              )
              .innerJoin(schema.programs, eq(schema.programs.id, schema.enrollments.programId))
              .where(and(
                eq(schema.studentProfiles.personId, actor.actorPersonId),
                eq(schema.enrollments.kind, "program"),
                eq(schema.enrollments.status, "active"),
                eq(schema.programs.siteId, schema.studyGroups.siteId),
                inArray(schema.programs.id, actor.scope.programIds ?? []),
                or(
                  isNull(schema.studyGroups.programId),
                  eq(schema.enrollments.programId, schema.studyGroups.programId),
                ),
              ));

            const activeSectionEnrollment = db
              .select({ id: schema.enrollments.id })
              .from(schema.studentProfiles)
              .innerJoin(
                schema.enrollments,
                eq(schema.enrollments.studentProfileId, schema.studentProfiles.id),
              )
              .innerJoin(schema.sections, eq(schema.sections.id, schema.enrollments.sectionId))
              .where(and(
                eq(schema.studentProfiles.personId, actor.actorPersonId),
                eq(schema.enrollments.kind, "section"),
                eq(schema.enrollments.status, "active"),
                eq(schema.enrollments.sectionId, schema.studyGroups.sectionId),
                eq(schema.sections.active, true),
                eq(schema.sections.siteId, schema.studyGroups.siteId),
                inArray(schema.sections.programId, actor.scope.programIds ?? []),
                or(
                  isNull(schema.studyGroups.programId),
                  eq(schema.sections.programId, schema.studyGroups.programId),
                ),
              ));

            return and(
              exists(approvedMembership),
              exists(activeProgramEnrollment),
              or(isNull(schema.studyGroups.sectionId), exists(activeSectionEnrollment)),
            );
          })()
        : undefined;

  if (!visibility) return [];

  const rows = await db
    .select({ id: schema.calendarEvents.id })
    .from(schema.calendarEvents)
    .innerJoin(
      schema.studyGroupSessions,
      eq(schema.calendarEvents.sourceId, schema.studyGroupSessions.id),
    )
    .innerJoin(
      schema.studyGroups,
      eq(schema.studyGroupSessions.groupId, schema.studyGroups.id),
    )
    .where(and(
      eq(schema.calendarEvents.type, "study_group"),
      eq(schema.calendarEvents.sourceType, "study_group_session"),
      gte(schema.calendarEvents.startsAt, rangeStart),
      lt(schema.calendarEvents.startsAt, rangeEnd),
      eq(schema.studyGroups.status, "active"),
      inArray(schema.studyGroups.siteId, [...siteIds]),
      visibility,
    ));

  return rows.map((row) => row.id);
}
