import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { visibleStudyGroupCalendarEventIds } from "@/modules/calendar/group-calendar-visibility.server";
import type { Actor } from "@/modules/identity/actors.server";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("study-group calendar visibility", () => {
  it("requires approved membership and current enrollment, or the scoped facilitator relationship", async () => {
    if (process.env.APP_ENV !== "test" || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
      throw new Error("Disposable test branch required");
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const [jurisdiction] = await db.insert(schema.jurisdictions).values({
      code: `sg-cal-${suffix}`, name: `Study group calendar ${suffix}`,
    }).returning();
    const [organization] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Study group calendar ${suffix}`,
      slug: `sg-cal-${suffix}`,
    }).returning();
    const [site] = await db.insert(schema.sites).values({
      organizationId: organization!.id,
      name: "Main",
      slug: `sg-cal-${suffix}`,
    }).returning();
    const [program] = await db.insert(schema.programs).values({
      organizationId: organization!.id,
      siteId: site!.id,
      jurisdictionId: jurisdiction!.id,
      type: "full_school",
      status: "active",
      name: "Study group calendar",
      slug: `sg-program-${suffix}`,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: organization!.id,
      creditIssuingOrganizationId: organization!.id,
    }).returning();
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");
    const academicTime = await createAcademicTimeFixture({
      organizationId: organization!.id,
      siteId: site!.id,
      programId: program!.id,
      suffix,
    });
    const [course] = await db.insert(schema.courseTemplates).values({
      owningOrganizationId: organization!.id,
      code: `SG-CAL-${suffix}`,
      title: "Study Group Calendar",
      subject: "Science",
    }).returning();
    const [version] = await db.insert(schema.courseTemplateVersions).values({
      courseTemplateId: course!.id,
      version: 1,
      status: "published",
    }).returning();
    const [section] = await db.insert(schema.sections).values({
      programId: program!.id,
      siteId: site!.id,
      courseTemplateVersionId: version!.id,
      termId: academicTime.term.id,
      code: `SG-CAL-${suffix}`,
      title: "Study Group Calendar",
    }).returning();
    const [facilitator, member, pendingMember, withdrawnMember, otherTeacher] =
      await db.insert(schema.people).values([
        { legalFirstName: "Facilitator", legalLastName: suffix },
        { legalFirstName: "Approved", legalLastName: suffix },
        { legalFirstName: "Pending", legalLastName: suffix },
        { legalFirstName: "Withdrawn", legalLastName: suffix },
        { legalFirstName: "Other", legalLastName: suffix },
      ]).returning();
    await db.insert(schema.sectionTeachers).values({
      sectionId: section!.id,
      personId: facilitator!.id,
    });
    const profiles = await db.insert(schema.studentProfiles).values([
      member!, pendingMember!, withdrawnMember!,
    ].map((person) => ({ personId: person.id, gradeLevel: "10" }))).returning();
    await db.insert(schema.enrollments).values([
      { studentProfileId: profiles[0]!.id, kind: "program", status: "active", organizationId: organization!.id, programId: program!.id },
      { studentProfileId: profiles[1]!.id, kind: "program", status: "active", organizationId: organization!.id, programId: program!.id },
      { studentProfileId: profiles[2]!.id, kind: "program", status: "withdrawn", organizationId: organization!.id, programId: program!.id },
    ]);

    const [group] = await db.insert(schema.studyGroups).values({
      title: `Science circle ${suffix}`,
      description: "Authorized calendar fixture",
      kind: "interest",
      siteId: site!.id,
      programId: program!.id,
      facilitatorPersonId: facilitator!.id,
      requiresApproval: true,
    }).returning();
    await db.insert(schema.studyGroupMemberships).values([
      { groupId: group!.id, personId: member!.id, status: "approved" },
      { groupId: group!.id, personId: pendingMember!.id, status: "pending" },
      { groupId: group!.id, personId: withdrawnMember!.id, status: "approved" },
    ]);
    const [session] = await db.insert(schema.studyGroupSessions).values({
      groupId: group!.id,
      title: `Science session ${suffix}`,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    }).returning();
    const [occurrence] = await db.insert(schema.scheduledOccurrences).values({
      startsAt: session!.startsAt,
      endsAt: session!.endsAt,
      timezone: "America/Los_Angeles",
      siteId: site!.id,
      programId: program!.id,
      createdByPersonId: facilitator!.id,
    }).returning();
    if (!occurrence) throw new Error("Calendar occurrence fixture missing");
    const [event] = await db.insert(schema.calendarEvents).values({
      type: "study_group",
      title: `Science session ${suffix}`,
      startsAt: session!.startsAt,
      endsAt: session!.endsAt,
      timezone: "America/Los_Angeles",
      siteId: site!.id,
      programId: program!.id,
      sourceType: "study_group_session",
      sourceId: session!.id,
      scheduledOccurrenceId: occurrence.id,
      createdByPersonId: facilitator!.id,
    }).returning();
    const [courseGroup] = await db.insert(schema.studyGroups).values({
      title: `Course circle ${suffix}`,
      description: "Course group calendar fixture",
      kind: "course",
      siteId: site!.id,
      programId: program!.id,
      sectionId: section!.id,
      facilitatorPersonId: facilitator!.id,
      requiresApproval: true,
    }).returning();
    await db.insert(schema.studyGroupMemberships).values({
      groupId: courseGroup!.id,
      personId: member!.id,
      status: "approved",
    });
    const [courseSession] = await db.insert(schema.studyGroupSessions).values({
      groupId: courseGroup!.id,
      title: `Course session ${suffix}`,
      startsAt: new Date(Date.now() + 172800000),
      endsAt: new Date(Date.now() + 176400000),
    }).returning();
    const [courseOccurrence] = await db.insert(schema.scheduledOccurrences).values({
      startsAt: courseSession!.startsAt,
      endsAt: courseSession!.endsAt,
      timezone: "America/Los_Angeles",
      siteId: site!.id,
      programId: program!.id,
      sectionId: section!.id,
      createdByPersonId: facilitator!.id,
    }).returning();
    if (!courseOccurrence) throw new Error("Calendar occurrence fixture missing");
    const [courseEvent] = await db.insert(schema.calendarEvents).values({
      type: "study_group",
      title: `Course session ${suffix}`,
      startsAt: courseSession!.startsAt,
      endsAt: courseSession!.endsAt,
      timezone: "America/Los_Angeles",
      siteId: site!.id,
      programId: program!.id,
      sectionId: section!.id,
      sourceType: "study_group_session",
      sourceId: courseSession!.id,
      scheduledOccurrenceId: courseOccurrence.id,
      createdByPersonId: facilitator!.id,
    }).returning();

    const actor = (personId: string, role: "student" | "teacher"): Actor => ({
      accountId: `account-${suffix}`,
      sessionId: `session-${suffix}`,
      grantId: `grant-${suffix}`,
      actorPersonId: personId,
      role,
      capabilities: new Set(),
      scope: { siteIds: [site!.id], programIds: [program!.id] },
    });
    const siteIds = [site!.id];
    const sectionIds: string[] = [];
    const teacherSectionIds = [section!.id];
    const rangeStart = new Date(Date.now());
    const rangeEnd = new Date(Date.now() + 3 * 86400000);

    const memberActor = actor(member!.id, "student");
    await expect(visibleStudyGroupCalendarEventIds(memberActor, siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.toContain(event!.id);
    await expect(visibleStudyGroupCalendarEventIds(memberActor, siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.not.toContain(courseEvent!.id);
    await expect(visibleStudyGroupCalendarEventIds(
      memberActor,
      siteIds,
      sectionIds,
      new Date(rangeStart.getTime() - 4 * 86400000),
      rangeStart,
    )).resolves.not.toContain(event!.id);
    await db.insert(schema.enrollments).values({
      studentProfileId: profiles[0]!.id,
      kind: "section",
      status: "withdrawn",
      organizationId: organization!.id,
      programId: program!.id,
      sectionId: section!.id,
      schoolYearId: academicTime.schoolYear.id,
    });
    await expect(visibleStudyGroupCalendarEventIds(memberActor, siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.not.toContain(courseEvent!.id);
    await db.update(schema.enrollments).set({ status: "active" }).where(and(
      eq(schema.enrollments.studentProfileId, profiles[0]!.id),
      eq(schema.enrollments.sectionId, section!.id),
    ));
    await expect(visibleStudyGroupCalendarEventIds(memberActor, siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.toContain(courseEvent!.id);
    await expect(visibleStudyGroupCalendarEventIds(actor(pendingMember!.id, "student"), siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.not.toContain(event!.id);
    await expect(visibleStudyGroupCalendarEventIds(actor(withdrawnMember!.id, "student"), siteIds, sectionIds, rangeStart, rangeEnd))
      .resolves.not.toContain(event!.id);
    await expect(visibleStudyGroupCalendarEventIds(actor(facilitator!.id, "teacher"), siteIds, teacherSectionIds, rangeStart, rangeEnd))
      .resolves.toContain(event!.id);
    await expect(visibleStudyGroupCalendarEventIds(actor(facilitator!.id, "teacher"), siteIds, teacherSectionIds, rangeStart, rangeEnd))
      .resolves.toContain(courseEvent!.id);
    await expect(visibleStudyGroupCalendarEventIds(actor(otherTeacher!.id, "teacher"), siteIds, [], rangeStart, rangeEnd))
      .resolves.not.toContain(event!.id);
  });
});
