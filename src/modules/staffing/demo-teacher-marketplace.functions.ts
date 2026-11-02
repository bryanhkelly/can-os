import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courseTemplates, courseTemplateVersions, instructorCapabilities,
  instructionalCapacityOfferings, instructorAvailabilityWindows,
  memberships, organizations, people,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "@/modules/learning/curriculum-marketplace.server";

/**
 * Read-only discovery of synthetic CAN-procured instructors for an already
 * selected school curriculum. This is not teacher assignment eligibility.
 * Only an isolated demo deployment may enable the projection.
 */
export const getDemoTeacherMarketplace = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ programId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(["registrar"]);
    // This must remain off on live deployments, even if synthetic rows exist.
    if (process.env.CAN_DEMO_TEACHER_PREVIEW_ENABLED !== "true" ||
        process.env.CAN_DEMO_ISOLATED_ENV !== "true")
      throw new AuthorizationError("Demo teacher marketplace requires an isolated demonstration environment");
    const market = await readMarketplace(actor, data.programId);
    const adopted = market.packs.filter(pack => pack.entitlement === "active" &&
      pack.adoption?.status === "active" && pack.adoption.versionId === pack.versionId);
    const adoptedCourses = adopted.flatMap(pack => pack.courses.map(course => ({
      code: course.code, title: course.title, subject: course.subject,
      versionId: course.courseVersionId, previewOnly: false,
    })));
    // Before a demo school has adopted any published packs, show the
    // dedicated publisher's synthetic draft catalog for DISCOVERY ONLY.
    // Preview rows are not entitlements, licensed adoption or class-ready.
    const previewRows = await db.select({
      templateId: courseTemplates.id, code: courseTemplates.code,
      title: courseTemplates.title, subject: courseTemplates.subject,
      versionId: courseTemplateVersions.id,
      version: courseTemplateVersions.version,
    }).from(courseTemplates)
      .innerJoin(courseTemplateVersions,
        eq(courseTemplateVersions.courseTemplateId, courseTemplates.id))
      .innerJoin(organizations, eq(organizations.id, courseTemplates.owningOrganizationId))
      .where(and(
        eq(organizations.slug, "can-demo-publisher"),
        sql`${organizations.metadata}->>'demoPublisher' = 'true'`,
        sql`${organizations.metadata}->>'isSynthetic' = 'true'`,
        sql`${courseTemplates.metadata}->>'sourceSystem' = 'can-demo-catalog-factory'`,
        sql`${courseTemplates.code} like 'CAN-DEMO-%'`,
      )).orderBy(courseTemplates.code, desc(courseTemplateVersions.version));
    const latest = new Map<string, (typeof previewRows)[number]>();
    for (const row of previewRows) if (!latest.has(row.templateId)) latest.set(row.templateId, row);
    const adoptedCodes = new Set(adoptedCourses.map(course => course.code));
    const courses = [...adoptedCourses, ...[...latest.values()]
      .filter(row => !adoptedCodes.has(row.code))
      .map(row => ({
        code: row.code, title: row.title, subject: row.subject,
        versionId: row.versionId, previewOnly: true,
      }))];
    const versionIds = [...new Set(courses.map(course => course.versionId))];
    if (!versionIds.length) return { program: market.program, courses: [], matchedTeachers: 0 };

    const rows = await db.select({
      versionId: courseTemplateVersions.id,
      personId: people.id,
      firstName: people.legalFirstName, lastName: people.legalLastName,
      teacherKey: sql<string>`${people.metadata}->>'demoFixtureKey'`,
      modality: instructionalCapacityOfferings.modality,
      maxSeats: instructionalCapacityOfferings.maxSeats,
      weeklyPattern: instructorAvailabilityWindows.weeklyPattern,
    }).from(courseTemplateVersions)
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
        inArray(courseTemplateVersions.id, versionIds),
        eq(organizations.slug, "can-demo-teaching-provider"),
        sql`${organizations.metadata}->>'demoProvider' = 'true'`,
        sql`${organizations.metadata}->>'isSynthetic' = 'true'`,
        sql`${people.metadata}->>'sourceSystem' = 'can-demo-teacher-marketplace-factory'`,
        sql`${instructionalCapacityOfferings.metadata}->>'demoOnly' = 'true'`,
        eq(instructorCapabilities.active, true),
        eq(people.active, true),
        eq(instructorAvailabilityWindows.active, true),
        eq(instructionalCapacityOfferings.status, "open"),
      ));
    const entries = courses.map(course => {
      const matches = rows.filter(row => row.versionId === course.versionId);
      const seen = new Set<string>();
      const teachers = matches.filter(row => {
        if (seen.has(row.personId)) return false;
        seen.add(row.personId);
        return true;
      }).map(row => ({
        personId: row.personId,
        name: row.firstName + " " + row.lastName,
        key: row.teacherKey,
        modality: row.modality,
        illustrativeSeatCapacity: row.maxSeats,
        weeklyDays: row.weeklyPattern?.days ?? [],
        isDemo: true as const,
        eligibility: "not_verified" as const,
      }));
      return {
        ...course,
        teacherOptions: teachers,
        sections: market.sections.filter(section => section.courseVersionId === course.versionId).map(section => ({ id: section.id, title: section.title, code: section.code })),
        sectionCount: market.sections.filter(section => section.courseVersionId === course.versionId).length,
      };
    });
    return {
      program: market.program, courses: entries,
      matchedTeachers: new Set(rows.map(row => row.personId)).size,
    };
  });
