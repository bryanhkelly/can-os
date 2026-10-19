import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { searchWorkspace } from "@/modules/search/global-search.functions";
import { listThreadContacts } from "@/modules/communication/messages.functions";
import { getPersonProfile } from "@/modules/profiles/person-profile.functions";
import type { Actor } from "@/modules/identity/actors.server";
import { and, eq } from "drizzle-orm";
import { createAcademicTimeFixture } from "./helpers/academic-time";

const state = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn(), getRequest: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => {
  if (!state.actor) throw new Error("Test actor missing");
  return state.actor;
} }));
vi.mock("@/modules/identity/actors.server", () => ({ requireActor: async () => {
  if (!state.actor) throw new Error("Test actor missing");
  return state.actor;
} }));

describe("canonical workspace search", () => {
  it("keeps academic search, profiles and messaging independent of enrollment and excuse permissions", async () => {
    const suffix = crypto.randomUUID();
    const [org] = await db.insert(s.organizations).values({
      name: "Search School", slug: `search-${suffix}`, type: "christian_school",
    }).returning();
    const [jurisdiction] = await db.insert(s.jurisdictions).values({ code: suffix, name: "Search" }).returning();
    const [site] = await db.insert(s.sites).values({
      organizationId: org!.id, name: "Search Site", slug: `search-${suffix}`,
    }).returning();
    const [program] = await db.insert(s.programs).values({
      organizationId: org!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id,
      type: "high_school_extension", status: "active", name: "Search Program", slug: `search-${suffix}`,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: org!.id, creditIssuingOrganizationId: org!.id,
    }).returning();
    const [guardian, student, teacher, coGuardian] = await db.insert(s.people).values([
      { legalFirstName: "Guardian", legalLastName: suffix },
      { legalFirstName: "Alex", legalLastName: suffix },
      { legalFirstName: "Teacher", legalLastName: suffix },
      { legalFirstName: "CoGuardian", legalLastName: suffix },
    ]).returning();
    const [profile] = await db.insert(s.studentProfiles).values({ personId: student!.id, gradeLevel: "9" }).returning();
    await db.insert(s.guardianRelationships).values({
      guardianPersonId: guardian!.id, studentPersonId: student!.id,
      relationshipLabel: "parent", canViewAcademics: true,
    });
    await db.insert(s.enrollments).values({
      studentProfileId: profile!.id, organizationId: org!.id, programId: program!.id,
      kind: "program", status: "active",
    });
    const time = await createAcademicTimeFixture({
      organizationId: org!.id, siteId: site!.id, programId: program!.id, suffix,
    });
    const [course] = await db.insert(s.courseTemplates).values({
      owningOrganizationId: org!.id, code: suffix, title: "Policy Course", subject: "Science",
    }).returning();
    const [version] = await db.insert(s.courseTemplateVersions).values({
      courseTemplateId: course!.id, version: 1,
    }).returning();
    const [section] = await db.insert(s.sections).values({
      siteId: site!.id, programId: program!.id, termId: time.term.id,
      courseTemplateVersionId: version!.id, title: "Policy Section", code: suffix,
    }).returning();
    await db.insert(s.sectionTeachers).values({ sectionId: section!.id, personId: teacher!.id });
    await db.insert(s.enrollments).values({
      studentProfileId: profile!.id, organizationId: org!.id, programId: program!.id,
      sectionId: section!.id, kind: "section", status: "active",
    });
    await db.insert(s.guardianRelationships).values({
      guardianPersonId: coGuardian!.id, studentPersonId: student!.id, relationshipLabel: "parent",
      canViewAcademics: false, canManageEnrollment: false, canSubmitAttendanceExcuse: false,
    });
    state.actor = {
      actorPersonId: guardian!.id, role: "guardian", capabilities: new Set(["student:related-read"]),
      accountId: "test", sessionId: "test", grantId: "test",
      scope: { siteIds: [site!.id], programIds: [program!.id] },
    };
    const result = await searchWorkspace({ data: { query: suffix } });
    expect(result.students).toEqual([expect.objectContaining({
      id: `student-${student!.id}`, label: `Alex ${suffix}`, to: `/guardian/academics?student=${student!.id}`,
    })]);
    const relationship = and(eq(s.guardianRelationships.guardianPersonId, guardian!.id),
      eq(s.guardianRelationships.studentPersonId, student!.id));
    for (let flags = 0; flags < 8; flags++) {
      const academic = Boolean(flags & 1);
      await db.update(s.guardianRelationships).set({
        canViewAcademics: academic,
        canManageEnrollment: Boolean(flags & 2),
        canSubmitAttendanceExcuse: Boolean(flags & 4),
      }).where(relationship);
      expect((await searchWorkspace({ data: { query: suffix } })).students).toHaveLength(academic ? 1 : 0);
      const profileRequest = getPersonProfile({ data: { personId: student!.id } });
      if (academic) {
        expect(await profileRequest).toMatchObject({ personId: student!.id });
      } else {
        await expect(profileRequest).rejects.toThrow("current profile relationship");
      }
      const { contacts } = await listThreadContacts();
      expect(contacts.map(contact => contact.personId).sort()).toEqual(
        academic ? [teacher!.id, coGuardian!.id].sort() : [],
      );
    }
    await db.update(s.guardianRelationships).set({ canViewAcademics: true }).where(relationship);
    for (const scope of [
      { siteIds: [], programIds: [program!.id] },
      { siteIds: [site!.id], programIds: [] },
      { siteIds: [site!.id], programIds: [crypto.randomUUID()] },
    ]) {
      state.actor = { ...state.actor, scope };
      expect((await searchWorkspace({ data: { query: suffix } })).students).toEqual([]);
      expect((await listThreadContacts()).contacts).toEqual([]);
      await expect(getPersonProfile({ data: { personId: student!.id } })).rejects.toThrow();
    }
    state.actor = { ...state.actor, actorPersonId: student!.id, role: "student",
      scope: { siteIds: [site!.id], programIds: [program!.id] } };
    expect((await listThreadContacts()).contacts.map(contact => contact.personId)).toEqual(
      expect.arrayContaining([guardian!.id, coGuardian!.id, teacher!.id]),
    );
  });
});
