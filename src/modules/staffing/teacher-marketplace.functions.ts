import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courseTemplates, courseTemplateVersions, instructorCapabilities,
  instructionalCapacityOfferings, instructorAvailabilityWindows, memberships,
  organizations, people, programs,
} from "@/db/schema";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "@/modules/learning/curriculum-marketplace.server";

/**
 * One CAN teacher marketplace for real and synthetic data.
 * Demo classification is derived from the provider's stored metadata.
 * Discovery is NOT a credential decision, class assignment or reservation.
 */
export const getTeacherMarketplace = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ programId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(["registrar"]);
    const market = await readMarketplace(actor, data.programId);
    const [school] = await db.select({
      academicProviderOrganizationId: programs.academicProviderOrganizationId,
      organizationId: programs.organizationId,
      siteId: programs.siteId,
      jurisdictionId: programs.jurisdictionId,
    }).from(programs).where(eq(programs.id, data.programId)).limit(1);
    // readMarketplace above verifies the actor's institution and program.
    if (!school) throw new Error("Selected school program no longer exists");

    const adopted = market.packs.filter(pack => pack.entitlement === "active" &&
      pack.adoption?.status === "active" && pack.adoption.versionId === pack.versionId);
    const courses = adopted.flatMap(pack => pack.courses.map(course => ({
      code: course.code, title: course.title, subject: course.subject,
      versionId: course.courseVersionId,
    })));
    const versionIds = [...new Set(courses.map(course => course.versionId))];
    if (!versionIds.length) return { program: market.program, courses: [], matchedTeachers: 0 };

    // A real CAN instructor belongs to the school's authorized academic provider.
    // A synthetic instructor belongs to an explicitly tagged teaching provider,
    // and can only match an explicitly tagged synthetic course template.
    const rows = await db.select({
      versionId: courseTemplateVersions.id,
      personId: people.id,
      firstName: people.legalFirstName, lastName: people.legalLastName,
      providerMetadata: organizations.metadata,
      modality: instructionalCapacityOfferings.modality,
      maxSeats: instructionalCapacityOfferings.maxSeats,
      weeklyPattern: instructorAvailabilityWindows.weeklyPattern,
    }).from(courseTemplateVersions)
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
        inArray(courseTemplateVersions.id, versionIds),
        or(isNull(instructionalCapacityOfferings.organizationId), eq(instructionalCapacityOfferings.organizationId, school.organizationId)),
        or(isNull(instructionalCapacityOfferings.siteId), school.siteId ? eq(instructionalCapacityOfferings.siteId, school.siteId) : sql`false`),
        or(isNull(instructionalCapacityOfferings.programId), eq(instructionalCapacityOfferings.programId, data.programId)),
        or(isNull(instructionalCapacityOfferings.jurisdictionId), eq(instructionalCapacityOfferings.jurisdictionId, school.jurisdictionId)),
        gte(instructorAvailabilityWindows.endsAt, new Date()),
        or(
          and(eq(organizations.id, school.academicProviderOrganizationId),
            sql`coalesce(${organizations.metadata}->>'isSynthetic', 'false') <> 'true'`,
            sql`coalesce(${instructionalCapacityOfferings.metadata}->>'previewOnly', 'false') <> 'true'`),
          and(
            sql`${courseTemplates.metadata}->>'sourceSystem' = 'can-demo-catalog-factory'`,
            sql`${organizations.metadata}->>'isSynthetic' = 'true'`,
            sql`${organizations.metadata}->>'demoProvider' = 'true'`,
            sql`${instructionalCapacityOfferings.metadata}->>'previewOnly' = 'true'`,
          ),
        ),
        eq(instructorCapabilities.active, true),
        eq(people.active, true),
        eq(instructorAvailabilityWindows.active, true),
        eq(instructionalCapacityOfferings.status, "open"),
      ));
    const entries = courses.map(course => {
      const seen = new Set<string>();
      const matches = rows.filter(row => row.versionId === course.versionId && !seen.has(row.personId) &&
        Boolean(seen.add(row.personId)));
      const sections = market.sections.filter(section => section.courseVersionId === course.versionId)
        .map(section => ({ id: section.id, title: section.title, code: section.code }));
      return {
        ...course,
        teacherOptions: matches.map(row => ({
          personId: row.personId,
          name: row.firstName + " " + row.lastName,
          modality: row.modality,
          indicativeSeatCapacity: row.maxSeats,
          weeklyDays: row.weeklyPattern?.days ?? [],
          isSynthetic: row.providerMetadata.isSynthetic === true,
          eligibility: "requires_CAN_review" as const,
        })),
        sections, sectionCount: sections.length,
      };
    });
    return { program: market.program, courses: entries,
      matchedTeachers: new Set(rows.map(row => row.personId)).size };
  });
