import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor, ActorRole } from "@/modules/identity/actors.server";
import {
  createFacilitatedGroup, createStudentStudyGroup, requestCanonicalGroupMembership,
  decideCanonicalGroupConsent, decideCanonicalGroupMembership,
} from "@/modules/study-groups/canonical-membership.functions";
import {
  createCanonicalGroupSession, rsvpCanonicalGroupSession,
  listCanonicalGroupAttendance, recordCanonicalGroupAttendance,
} from "@/modules/study-groups/canonical-sessions.functions";
import {
  createCanonicalGroupPost, reportCanonicalGroupPost, resolveCanonicalGroupReport,
} from "@/modules/study-groups/canonical-moderation.functions";
import { createAcademicTimeFixture } from "./helpers/academic-time";
import { listCanonicalGuardianGroupConsents } from "@/modules/study-groups/canonical-workspace.functions";
import {
  listStudentStudyGroupClassmates, listStudentStudyGroupSections,
} from "@/modules/study-groups/study-group-queries.functions";

const state = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://can.local"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.actor,
}));
vi.mock("@/modules/identity/actors.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/identity/actors.server")>(),
  requireActor: async (roles: readonly ActorRole[]) => {
    if (!state.actor || !roles.includes(state.actor.role as ActorRole)) throw new Error("Test actor role denied");
    return state.actor;
  },
}));

describe("canonical study group commands", () => {
  it("preserves interest groups, guardian consent, RSVP-independent attendance and moderation", async () => {
    const suffix = crypto.randomUUID();
    const [org] = await db.insert(s.organizations).values({
      type: "christian_school", name: "Group School", slug: `groups-${suffix}`,
    }).returning();
    const [jurisdiction] = await db.insert(s.jurisdictions).values({ code: suffix, name: "Groups" }).returning();
    const [site] = await db.insert(s.sites).values({
      organizationId: org!.id, name: "Group Site", slug: suffix,
    }).returning();
    const [program] = await db.insert(s.programs).values({
      organizationId: org!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id,
      type: "full_school", status: "active", name: "Group Program", slug: suffix,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: org!.id, creditIssuingOrganizationId: org!.id,
    }).returning();
    const time = await createAcademicTimeFixture({
      organizationId: org!.id, siteId: site!.id, programId: program!.id, suffix,
    });
    const [teacher, student, guardian, otherStudent, outsider] = await db.insert(s.people).values(
      ["Teacher", "Student", "Guardian", "OtherStudent", "Outsider"].map(legalFirstName => ({
        legalFirstName, legalLastName: suffix,
      })),
    ).returning();
    const profiles = await db.insert(s.studentProfiles).values(
      [student!, otherStudent!].map(person => ({ personId: person.id, gradeLevel: "9" })),
    ).returning();
    await db.insert(s.enrollments).values(profiles.map(profile => ({
      studentProfileId: profile.id, kind: "program" as const, status: "active" as const,
      organizationId: org!.id, programId: program!.id, schoolYearId: time.schoolYear.id,
    })));
    const [course] = await db.insert(s.courseTemplates).values({
      owningOrganizationId: org!.id, code: suffix, title: "Group Course", subject: "Science",
    }).returning();
    const [version] = await db.insert(s.courseTemplateVersions).values({
      courseTemplateId: course!.id, version: 1,
    }).returning();
    const [section] = await db.insert(s.sections).values({
      programId: program!.id, siteId: site!.id, termId: time.term.id,
      courseTemplateVersionId: version!.id, code: suffix, title: "Group Section",
    }).returning();
    await db.insert(s.sectionTeachers).values({ sectionId: section!.id, personId: teacher!.id });
    await db.insert(s.enrollments).values(profiles.map(profile => ({
      studentProfileId: profile.id, kind: "section" as const, status: "active" as const,
      organizationId: org!.id, programId: program!.id, sectionId: section!.id,
      schoolYearId: time.schoolYear.id,
    })));
    await db.insert(s.guardianRelationships).values({
      guardianPersonId: guardian!.id, studentPersonId: student!.id, relationshipLabel: "parent",
    });
    const actor = (role: ActorRole, personId: string): Actor => ({
      accountId: suffix, sessionId: suffix, grantId: suffix, role, actorPersonId: personId,
      capabilities: new Set(), requestId: suffix,
      scope: { organizationIds: [org!.id], siteIds: [site!.id], programIds: [program!.id] },
    });
    state.actor = actor("teacher", teacher!.id);
    const { groupId } = await createFacilitatedGroup({ data: {
      siteId: site!.id, kind: "interest", title: "Science Club",
      description: "Students exploring science together.", maxMembers: 10,
    } });
    const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, groupId));
    expect(group).toMatchObject({ kind: "interest", programId: null, sectionId: null });

    state.actor = actor("student", student!.id);
    await expect(listStudentStudyGroupSections()).resolves.toEqual([
      { id: section!.id, title: "Group Section" },
    ]);
    await expect(listStudentStudyGroupClassmates({ data: { sectionId: section!.id } }))
      .resolves.toEqual([expect.objectContaining({
        id: otherStudent!.id, firstName: "OtherStudent", lastName: suffix,
      })]);
    const { groupId: studentGroupId } = await createStudentStudyGroup({ data: {
      sectionId: section!.id, title: "Science study circle",
      description: "A student-organized group to review science together.",
      inviteePersonIds: [otherStudent!.id], maxMembers: 10,
    } });
    const [studentGroup] = await db.select().from(s.studyGroups)
      .where(eq(s.studyGroups.id, studentGroupId));
    expect(studentGroup).toMatchObject({
      sectionId: section!.id, siteId: site!.id, programId: program!.id,
      facilitatorPersonId: teacher!.id, requiresApproval: true,
      metadata: { createdByStudentPersonId: student!.id },
    });
    const [organizerMembership] = await db.select().from(s.studyGroupMemberships)
      .where(and(eq(s.studyGroupMemberships.groupId, studentGroupId),
        eq(s.studyGroupMemberships.personId, student!.id)));
    expect(organizerMembership?.status).toBe("pending");
    expect(await db.select().from(s.actions).where(and(
      eq(s.actions.subjectId, studentGroupId),
      eq(s.actions.ownerPersonId, guardian!.id),
    ))).toHaveLength(1);
    const [invitation] = await db.select().from(s.notifications).where(and(
      eq(s.notifications.recipientPersonId, otherStudent!.id),
      eq(s.notifications.resourceId, studentGroupId),
      eq(s.notifications.type, "study_group_invitation"),
    ));
    expect(invitation?.body).toContain("guardian permission and facilitator approval");
    await expect(createStudentStudyGroup({ data: {
      sectionId: section!.id, title: "Invalid invite group",
      description: "This invitation should be rejected safely.",
      inviteePersonIds: [outsider!.id], maxMembers: 10,
    } })).rejects.toThrow();
    expect(await db.select().from(s.studyGroups)
      .where(eq(s.studyGroups.title, "Invalid invite group"))).toHaveLength(0);

    const relationship = and(eq(s.guardianRelationships.guardianPersonId, guardian!.id),
      eq(s.guardianRelationships.studentPersonId, student!.id));
    await db.update(s.guardianRelationships).set({
      canManageEnrollment: false, canViewAcademics: true, canSubmitAttendanceExcuse: true,
    }).where(relationship);
    await expect(requestCanonicalGroupMembership({ data: { groupId } }))
      .rejects.toThrow("A linked guardian is required");
    await db.update(s.guardianRelationships).set({
      canManageEnrollment: true, canViewAcademics: false, canSubmitAttendanceExcuse: false,
    }).where(relationship);
    await requestCanonicalGroupMembership({ data: { groupId } });
    state.actor = actor("teacher", teacher!.id);
    await expect(decideCanonicalGroupMembership({ data: {
      groupId, studentPersonId: student!.id, approve: true,
    } })).rejects.toThrow("Every current enrollment guardian must approve");
    const [consent] = await db.select().from(s.actions).where(and(
      eq(s.actions.subjectId, groupId), eq(s.actions.ownerPersonId, guardian!.id),
    ));
    state.actor = actor("guardian", guardian!.id);
    expect(await listCanonicalGuardianGroupConsents()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: consent!.id })]),
    );
    await db.update(s.guardianRelationships).set({ canManageEnrollment: false }).where(relationship);
    expect(await listCanonicalGuardianGroupConsents()).toEqual([]);
    await expect(decideCanonicalGroupConsent({ data: {
      actionId: consent!.id, approve: true, acknowledged: true,
    } })).rejects.toThrow();
    await db.update(s.guardianRelationships).set({ canManageEnrollment: true }).where(relationship);
    await decideCanonicalGroupConsent({ data: { actionId: consent!.id, approve: true, acknowledged: true } });
    state.actor = actor("teacher", teacher!.id);
    await decideCanonicalGroupMembership({ data: { groupId, studentPersonId: student!.id, approve: true } });
    await db.insert(s.studyGroupMemberships).values({
      groupId, personId: otherStudent!.id, role: "student", status: "approved",
    });

    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const { sessionId } = await createCanonicalGroupSession({ data: {
      groupId, title: "Science session", agenda: "", location: "", startsAt, endsAt,
    } });
    const projections = await db.select().from(s.calendarEvents).where(and(
      eq(s.calendarEvents.sourceType, "study_group_session"),
      eq(s.calendarEvents.sourceId, sessionId),
    ));
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      type: "study_group", title: "Science session", description: "",
      siteId: site!.id, programId: null, sectionId: null,
      startsAt: new Date(startsAt), endsAt: new Date(endsAt),
      timezone: site!.timezone, createdByPersonId: teacher!.id,
    });
    state.actor = actor("student", student!.id);
    await rsvpCanonicalGroupSession({ data: { sessionId, rsvp: "going" } });
    state.actor = actor("teacher", teacher!.id);
    expect(await listCanonicalGroupAttendance({ data: { sessionId } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: student!.id, rsvp: "going" }),
        expect.objectContaining({ personId: otherStudent!.id, rsvp: null }),
      ]),
    );
    await expect(recordCanonicalGroupAttendance({ data: {
      sessionId, studentPersonId: otherStudent!.id, attended: true,
    } })).rejects.toThrow("after a session starts");
    await db.update(s.studyGroupSessions).set({ startsAt: new Date(Date.now() - 3600000) })
      .where(eq(s.studyGroupSessions.id, sessionId));
    await recordCanonicalGroupAttendance({ data: {
      sessionId, studentPersonId: otherStudent!.id, attended: true,
    } });

    const { postId } = await createCanonicalGroupPost({ data: { groupId, body: "Please review this post." } });
    state.actor = actor("student", student!.id);
    const reports = await Promise.all([1, 2].map(() => reportCanonicalGroupPost({ data: {
      groupId, postId, reason: "Needs facilitator review.",
    } })));
    expect(new Set(reports.map(report => report.reportId)).size).toBe(1);
    expect(reports.filter(report => report.created)).toHaveLength(1);
    state.actor = actor("teacher", outsider!.id);
    await expect(resolveCanonicalGroupReport({ data: {
      reportId: reports[0]!.reportId, hidePost: true,
    } })).rejects.toThrow("active facilitated group");
    state.actor = actor("teacher", teacher!.id);
    await resolveCanonicalGroupReport({ data: { reportId: reports[0]!.reportId, hidePost: true } });
    const [post] = await db.select().from(s.studyGroupPosts).where(eq(s.studyGroupPosts.id, postId));
    expect(post?.hidden).toBe(true);
    const [action] = await db.select().from(s.actions).where(eq(s.actions.subjectId, reports[0]!.reportId));
    expect(action?.status).toBe("resolved");
    expect(await db.select().from(s.domainEvents).where(and(
      eq(s.domainEvents.aggregateId, action!.id), eq(s.domainEvents.eventType, "ActionResolved"),
    ))).toHaveLength(1);
    const audits = await db.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, groupId));
    expect(audits.some(audit => audit.context.requestId === suffix)).toBe(true);
  });
});
