import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courseTemplates, courseTemplateVersions, curriculumAdoptions, curriculumEntitlements,
  curriculumPackItems, curriculumPackVersions, instructorCapabilities,
  instructionalCapacityOfferings, instructorAvailabilityWindows, memberships,
  organizations, people, programs, sections, sectionCapacityDemands,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "@/modules/learning/curriculum-marketplace.server";
import { assignLaunchInstructor, evaluateLaunchTeacher } from "@/modules/staffing/launch-staffing.server";
import {
  findCapacityCandidates, findCapacityCandidatesInTransaction,
} from "@/modules/staffing/educational-capacity-service";

/**
 * One CAN teacher marketplace for real and synthetic data.
 * Demo classification is derived from the provider's stored metadata.
 * Discovery identifies only real candidates currently eligible and reservable
 * for at least one active class; final assignment still rechecks transactionally.
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
    const activeSections = school.siteId ? await db.select({
      id: sections.id,
      title: sections.title,
      code: sections.code,
      courseVersionId: sections.courseTemplateVersionId,
      capacityDemandId: sectionCapacityDemands.id,
      capacityDemandStatus: sectionCapacityDemands.status,
    }).from(sections)
      .leftJoin(sectionCapacityDemands, eq(sectionCapacityDemands.sectionId, sections.id))
      .where(and(
      eq(sections.programId, data.programId),
      eq(sections.siteId, school.siteId),
      eq(sections.active, true),
      inArray(sections.courseTemplateVersionId, versionIds),
    )).orderBy(asc(sections.title), asc(sections.code)) : [];

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
    const entries = await Promise.all(courses.map(async course => {
      const seen = new Set<string>();
      const matches = rows.filter(row => row.versionId === course.versionId && !seen.has(row.personId) &&
        Boolean(seen.add(row.personId)));
      const courseSections = activeSections.filter(section => section.courseVersionId === course.versionId)
        .map(section => ({ id: section.id, title: section.title, code: section.code }));
      const eligibleBySection = new Map<string, Map<string, { modality: string; maxSeats: number }>>();
      for (const section of activeSections.filter(item => item.courseVersionId === course.versionId &&
        item.capacityDemandId && item.capacityDemandStatus === "open")) {
        const capacityCandidates = await findCapacityCandidates(actor, section.capacityDemandId!);
        for (const candidate of capacityCandidates) {
          if (candidate.remainingSeats < candidate.requiredSeats ||
              candidate.remainingDemandSeats < candidate.requiredSeats) continue;
          const eligibility = await evaluateLaunchTeacher(section.id, candidate.personId);
          if (!eligibility.eligible) continue;
          const eligibleSections = eligibleBySection.get(candidate.personId) ??
            new Map<string, { modality: string; maxSeats: number }>();
          eligibleSections.set(section.id, {
            modality: candidate.modality,
            maxSeats: candidate.maxSeats,
          });
          eligibleBySection.set(candidate.personId, eligibleSections);
        }
      }
      const teacherOptions = matches.flatMap(row => {
        const isSynthetic = row.providerMetadata.isSynthetic === true;
        const eligibleOffers = eligibleBySection.get(row.personId) ?? new Map();
        const eligibleSectionIds = [...eligibleOffers.keys()];
        if (!isSynthetic && !eligibleSectionIds.length) return [];
        const offers = [...eligibleOffers.values()];
        return [{
          personId: row.personId,
          name: row.firstName + " " + row.lastName,
          modality: offers[0]?.modality ?? row.modality,
          indicativeSeatCapacity: offers.length
            ? Math.max(...offers.map(offer => offer.maxSeats))
            : row.maxSeats,
          weeklyDays: row.weeklyPattern?.days ?? [],
          isSynthetic,
          eligibleSectionIds,
        }];
      });
      return {
        ...course,
        teacherOptions,
        sections: courseSections, sectionCount: courseSections.length,
      };
    }));
    return { program: market.program, courses: entries,
      matchedTeachers: new Set(entries.flatMap(course =>
        course.teacherOptions.map(teacher => teacher.personId))).size };
  });

const engageInput = z.object({
  programId: z.string().uuid(),
  courseVersionId: z.string().uuid(),
  teacherPersonId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
}).strict();

/** The school directly engages an onboarded provider teacher; CAN does not
 * review the school's selection. Course-wide engagements are one transaction.
 */
export const engageMarketplaceTeacher = createServerFn({ method: "POST" })
  .validator((value: unknown) => engageInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], "program.launch.start");
    if (!actor.scope.programIds?.includes(data.programId))
      throw new AuthorizationError("teacher engagement program scope");
    const market = await readMarketplace(actor, data.programId);
    const visibleCourse = market.packs.some(pack =>
      pack.entitlement === "active" &&
      pack.adoption?.status === "active" &&
      pack.adoption.versionId === pack.versionId &&
      pack.courses.some(course => course.courseVersionId === data.courseVersionId));
    if (!visibleCourse)
      throw new AuthorizationError("teacher engagement requires an adopted course");

    return db.transaction(async tx => {
      const [program] = await tx.select({
        organizationId: programs.organizationId,
        siteId: programs.siteId,
        academicProviderOrganizationId: programs.academicProviderOrganizationId,
        jurisdictionId: programs.jurisdictionId,
      }).from(programs).where(eq(programs.id, data.programId)).for("update").limit(1);
      if (!program?.siteId || !program.academicProviderOrganizationId ||
          !actor.scope.organizationIds?.includes(program.organizationId) ||
          !actor.scope.siteIds?.includes(program.siteId))
        throw new AuthorizationError("teacher engagement school scope");

      const [adoptedCourse] = await tx.select({ id: curriculumPackItems.id })
        .from(curriculumAdoptions)
        .innerJoin(curriculumEntitlements, and(
          eq(curriculumEntitlements.packId, curriculumAdoptions.packId),
          eq(curriculumEntitlements.organizationId, program.organizationId),
        ))
        .innerJoin(curriculumPackVersions, and(
          eq(curriculumPackVersions.id, curriculumAdoptions.packVersionId),
          eq(curriculumPackVersions.packId, curriculumAdoptions.packId),
        ))
        .innerJoin(curriculumPackItems, and(
          eq(curriculumPackItems.packVersionId, curriculumPackVersions.id),
          eq(curriculumPackItems.courseTemplateVersionId, data.courseVersionId),
        ))
        .where(and(
          eq(curriculumAdoptions.programId, data.programId),
          eq(curriculumAdoptions.status, "active"),
          eq(curriculumEntitlements.status, "active"),
          eq(curriculumPackVersions.status, "published"),
        )).limit(1);
      if (!adoptedCourse)
        throw new AuthorizationError("course is no longer actively adopted by this school");

      const [candidate] = await tx.select({ personId: people.id })
        .from(courseTemplateVersions)
        .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
        .innerJoin(instructorCapabilities, or(
          eq(instructorCapabilities.courseTemplateId, courseTemplates.id),
          and(isNull(instructorCapabilities.courseTemplateId),
            eq(instructorCapabilities.subject, courseTemplates.subject)),
        ))
        .innerJoin(people, eq(people.id, instructorCapabilities.personId))
        .innerJoin(memberships, and(
          eq(memberships.personId, people.id),
          eq(memberships.organizationId, program.academicProviderOrganizationId),
        ))
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .innerJoin(instructionalCapacityOfferings, and(
          eq(instructionalCapacityOfferings.personId, people.id),
          eq(instructionalCapacityOfferings.capabilityId, instructorCapabilities.id),
        ))
        .innerJoin(instructorAvailabilityWindows,
          eq(instructorAvailabilityWindows.id, instructionalCapacityOfferings.availabilityWindowId))
        .where(and(
          eq(courseTemplateVersions.id, data.courseVersionId),
          eq(people.id, data.teacherPersonId),
          eq(organizations.id, program.academicProviderOrganizationId),
          or(isNull(instructionalCapacityOfferings.organizationId),
            eq(instructionalCapacityOfferings.organizationId, program.organizationId)),
          or(isNull(instructionalCapacityOfferings.siteId),
            eq(instructionalCapacityOfferings.siteId, program.siteId)),
          or(isNull(instructionalCapacityOfferings.programId),
            eq(instructionalCapacityOfferings.programId, data.programId)),
          or(isNull(instructionalCapacityOfferings.jurisdictionId),
            eq(instructionalCapacityOfferings.jurisdictionId, program.jurisdictionId)),
          gte(instructorAvailabilityWindows.endsAt, new Date()),
          sql`coalesce(${organizations.metadata}->>'isSynthetic', 'false') <> 'true'`,
          sql`coalesce(${instructionalCapacityOfferings.metadata}->>'previewOnly', 'false') <> 'true'`,
          eq(instructorCapabilities.active, true),
          eq(people.active, true),
          eq(instructorAvailabilityWindows.active, true),
          eq(instructionalCapacityOfferings.status, "open"),
        )).limit(1);
      if (!candidate)
        throw new AuthorizationError("selected person is not an onboarded teacher offered for this course");

      const sectionConditions = [
        eq(sections.programId, data.programId),
        eq(sections.siteId, program.siteId),
        eq(sections.courseTemplateVersionId, data.courseVersionId),
        eq(sections.active, true),
        ...(data.sectionId ? [eq(sections.id, data.sectionId)] : []),
      ];
      const targetSections = await tx.select({ id: sections.id }).from(sections)
        .where(and(...sectionConditions)).orderBy(asc(sections.id)).for("update");
      if (data.sectionId && targetSections.length !== 1)
        throw new AuthorizationError("selected class does not belong to this adopted course and school");
      if (!targetSections.length)
        throw new Error("No active classes exist for this adopted course.");

      let sectionCount = 0;
      let engaged = 0;
      let alreadyEngaged = 0;
      for (const section of targetSections) {
        const [capacityDemand] = await tx.select({
          id: sectionCapacityDemands.id,
          status: sectionCapacityDemands.status,
        }).from(sectionCapacityDemands).where(eq(sectionCapacityDemands.sectionId, section.id))
          .for("update").limit(1);
        if (!capacityDemand || capacityDemand.status !== "open") {
          if (data.sectionId)
            throw new Error("Class has no open instructional capacity demand; set it up before engaging a teacher");
          continue;
        }
        const eligibility = await evaluateLaunchTeacher(section.id, data.teacherPersonId, tx);
        if (!eligibility.eligible) {
          if (data.sectionId)
            throw new Error("Instructor is not eligible: " + eligibility.reasons.join(" "));
          continue;
        }
        const capacities = await findCapacityCandidatesInTransaction(tx, actor, capacityDemand.id);
        if (!capacities.some(candidate => candidate.personId === data.teacherPersonId &&
          candidate.remainingSeats >= candidate.requiredSeats &&
          candidate.remainingDemandSeats >= candidate.requiredSeats)) {
          if (data.sectionId)
            throw new Error("Instructor has no available capacity for this class schedule and enrollment demand");
          continue;
        }
        const result = await assignLaunchInstructor(tx, actor, {
          programId: data.programId,
          sectionId: section.id,
          teacherPersonId: data.teacherPersonId,
          capacityDemandId: capacityDemand.id,
        });
        sectionCount++;
        if (result.created) engaged++;
        else alreadyEngaged++;
      }
      if (!sectionCount)
        throw new Error("No active classes are currently compatible with this teacher's eligibility, schedule, and capacity");
      return { sectionCount, engaged, alreadyEngaged };
    });
  });
