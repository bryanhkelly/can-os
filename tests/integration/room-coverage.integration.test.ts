import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import * as s from "@/db/schema";
import { setupSchool } from "@/modules/identity/school-setup.server";
import { redeemDemoAccess } from "@/modules/identity/passwordless-access.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { createRoomAtSite } from "@/modules/operations/site-rooms.server";
import {
  activeRoomCoverageSectionIds, getRoomCoverageWorkspace, loadRoomCoverageSchedules,
  roomCoverageForBlock, roomCoverageOccupancy, saveRoomCoverage, siteUsesRoomCoverage,
} from "@/modules/operations/room-coverage.server";
import { verifiedStaffIdentityPredicate } from "@/modules/identity/verified-staff-identity.server";
import { emitEvent } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { addCalendarDays } from "@/modules/calendar/timezone";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Tx | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Room coverage requires an isolated rollback transaction");
    return state.tx;
  },
}));
afterEach(() => { state.tx = undefined; vi.unstubAllEnvs(); });
const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("canonical mixed-course room coverage", () => {
  it("binds accepted identities, preserves exact-school authority, revisions, distinct occupancy and audit", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-room-coverage");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        for (const [table, migration] of [
          ["demo_school_tenants", "0061_demo_school_tenants.sql"], ["site_rooms", "0062_site_rooms.sql"],
          ["room_coverage_schedules", "0071_room_coverage.sql"],
        ]) {
          const result = await tx.execute(sql`select to_regclass(${`public.${table}`}) as name`);
          if (!result.rows[0]?.name) await tx.execute(sql.raw(readFileSync(`drizzle\\${migration}`, "utf8")));
        }
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "isolated-room-coverage-test-pepper");
        const suffix = crypto.randomUUID().slice(0, 8);
        const school = await setupSchool({ name: "Synthetic Room School", domain: `room-${suffix}.demo`,
          timezone: "America/Los_Angeles", syntheticOnly: true }, tx);
        const login = await redeemDemoAccess(school.adminEmail, "000000");
        const request = new Request("https://app.example.test", { headers: { cookie: login.setCookie.split(";")[0]! } });
        const actor = await getCommandContext(request);
        const roomId = crypto.randomUUID();
        const roomInput = { siteId: school.siteId, roomId, name: "Youth Classroom 2", capacity: 20 };
        expect(await createRoomAtSite(actor, roomInput)).toMatchObject({ created: true });
        expect(await createRoomAtSite(actor, roomInput)).toMatchObject({ created: false });

        const [person] = await tx.insert(s.people).values({ legalFirstName: "Synthetic", legalLastName: "Facilitator" }).returning();
        const [account] = await tx.insert(s.accessAccounts).values({ emailNormalized: `facilitator@${school.domain}` }).returning();
        const [grant] = await tx.insert(s.accountPersonGrants).values({
          personId: person!.id, accountId: account!.id, organizationId: school.organizationId,
          siteId: school.siteId, role: "room_facilitator", active: false,
        }).returning();
        const identity = async () => {
          const [row] = await tx.select({ verified: verifiedStaffIdentityPredicate() })
            .from(s.accountPersonGrants).innerJoin(s.accessAccounts, eq(s.accessAccounts.id, s.accountPersonGrants.accountId))
            .where(eq(s.accountPersonGrants.id, grant!.id));
          return row?.verified;
        };
        await emitEvent(tx, { eventType: EventTypes.StaffInvitationIssued, aggregateType: "StaffInvitation",
          aggregateId: grant!.id, actorPersonId: actor.actorPersonId, organizationId: school.organizationId,
          siteId: school.siteId, payload: { accountId: account!.id, personId: person!.id, role: "room_facilitator" } });
        expect(await identity()).toBe(false);
        const staffLogin = await redeemDemoAccess(account!.emailNormalized, "000000");
        expect(await identity()).toBe(true);
        expect((await tx.select().from(s.accessAccounts).where(eq(s.accessAccounts.id, account!.id)))[0]?.emailVerifiedAt).toBeNull();
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
        const input = {
          siteId: school.siteId, id: crypto.randomUUID(), expectedRevision: null, roomId,
          primaryPersonId: person!.id, backupPersonId: null, startsOn: today, endsOn: addCalendarDays(today, 30),
          weekdays: [2, 3, 4], startsAtLocal: "08:00", endsAtLocal: "14:00", sectionIds: [] as string[],
        };
        expect(await saveRoomCoverage(actor, input)).toMatchObject({ revision: 1, changed: true });
        expect(await saveRoomCoverage(actor, input)).toMatchObject({ revision: 1, changed: false });
        expect((await getRoomCoverageWorkspace(actor, {})).schedules).toHaveLength(1);
        await tx.update(s.accessAccounts).set({ disabled: true }).where(eq(s.accessAccounts.id, account!.id));
        await expect(saveRoomCoverage(actor, input)).rejects.toThrow("accepted exact-Site facilitator identities");
        await tx.update(s.accessAccounts).set({ disabled: false }).where(eq(s.accessAccounts.id, account!.id));
        const [otherOrganization] = await tx.insert(s.organizations).values({
          type: "church", name: "Synthetic other school", slug: `other-room-${suffix}`,
        }).returning();
        const [otherPerson] = await tx.insert(s.people).values({
          legalFirstName: "Synthetic", legalLastName: "Other Facilitator",
        }).returning();
        const [otherAccount] = await tx.insert(s.accessAccounts).values({
          emailNormalized: `synthetic-${suffix}@example.test`, emailVerifiedAt: new Date(),
        }).returning();
        const [otherGrant] = await tx.insert(s.accountPersonGrants).values({
          accountId: otherAccount!.id, personId: otherPerson!.id, role: "room_facilitator",
          organizationId: otherOrganization!.id, active: true,
        }).returning();
        const otherIdentity = async () => {
          const [row] = await tx.select({ verified: verifiedStaffIdentityPredicate() })
            .from(s.accountPersonGrants).innerJoin(s.accessAccounts, eq(s.accessAccounts.id, s.accountPersonGrants.accountId))
            .where(eq(s.accountPersonGrants.id, otherGrant!.id));
          return row?.verified;
        };
        expect(await otherIdentity()).toBe(true);
        await expect(saveRoomCoverage(actor, { ...input, primaryPersonId: otherPerson!.id }))
          .rejects.toThrow("accepted exact-Site facilitator identities");
        await tx.update(s.accessAccounts).set({ emailVerifiedAt: null }).where(eq(s.accessAccounts.id, otherAccount!.id));
        expect(await otherIdentity()).toBe(false);

        const [jurisdiction] = await tx.insert(s.jurisdictions).values({ code: `ROOM-${suffix}`, name: "Synthetic" }).returning();
        const [program] = await tx.insert(s.programs).values({ organizationId: school.organizationId, siteId: school.siteId,
          jurisdictionId: jurisdiction!.id, academicProviderOrganizationId: school.organizationId,
          type: "full_school", name: "Synthetic program", slug: suffix, gradeRange: { min: "1", max: "12" },
          deliveryModel: { onsite: true, liveOnline: true } }).returning();
        const [scale] = await tx.insert(s.gradeScales).values({ owningOrganizationId: school.organizationId,
          name: "Synthetic", version: 1, configuration: { entries: [] } }).returning();
        const [year] = await tx.insert(s.schoolYears).values({ organizationId: school.organizationId, siteId: school.siteId,
          programId: program!.id, gradeScaleId: scale!.id, key: suffix, name: "Synthetic",
          startsOn: today, endsOn: input.endsOn }).returning();
        const [term] = await tx.insert(s.terms).values({ schoolYearId: year!.id, key: suffix, name: "Synthetic",
          sequence: 1, startsOn: today, endsOn: input.endsOn }).returning();
        const [course] = await tx.insert(s.courseTemplates).values({ owningOrganizationId: school.organizationId,
          code: suffix, title: "Synthetic course", subject: "Science" }).returning();
        const [version] = await tx.insert(s.courseTemplateVersions).values({ courseTemplateId: course!.id, version: 1 }).returning();
        const classes = await tx.insert(s.sections).values(["Mathematics", "Science"].map(title => ({
          programId: program!.id, siteId: school.siteId, courseTemplateVersionId: version!.id,
          termId: term!.id, code: title, title,
        }))).returning();
        const refreshedActor = await getCommandContext(request);
        const linked = { ...input, expectedRevision: 1, sectionIds: classes.map(row => row.id) };
        expect(await saveRoomCoverage(refreshedActor, linked)).toMatchObject({ revision: 2 });
        await expect(saveRoomCoverage(refreshedActor, { ...linked, endsAtLocal: "13:00" })).rejects.toThrow("refresh");
        await expect(saveRoomCoverage(refreshedActor, { ...linked, id: crypto.randomUUID(), expectedRevision: null })).rejects.toThrow("overlapping");
        await expect(saveRoomCoverage({ ...refreshedActor, grantSiteId: crypto.randomUUID() }, linked)).rejects.toThrow("exact-Site");
        const staff = await getCommandContext(new Request("https://app.example.test", {
          headers: { cookie: staffLogin.setCookie.split(";")[0]! },
        }));
        await expect(saveRoomCoverage(staff, linked)).rejects.toThrow("administrator");
        expect((await getRoomCoverageWorkspace(staff, {})).canManage).toBe(false);
        expect(staff.capabilities.has("assignments:grade")).toBe(false);
        let tuesday = today;
        while (new Date(tuesday + "T12:00:00Z").getUTCDay() !== 2) tuesday = addCalendarDays(tuesday, 1);
        expect(await activeRoomCoverageSectionIds(tx, staff, program!.id, tuesday)).toEqual(expect.arrayContaining(linked.sectionIds));
        expect(await activeRoomCoverageSectionIds(tx, staff, program!.id, addCalendarDays(tuesday, 3))).toEqual([]);
        const [coverage] = await loadRoomCoverageSchedules(tx, school.siteId);
        expect(roomCoverageForBlock([coverage!], { sectionId: classes[0]!.id, date: tuesday,
          startsAtLocal: "09:00:00", endsAtLocal: "10:00:00" })?.id).toBe(input.id);

        const students = await tx.insert(s.people).values(Array.from({ length: 21 }, (_, index) => ({
          legalFirstName: "Synthetic", legalLastName: `Learner ${index}`,
        }))).returning();
        const profiles = await tx.insert(s.studentProfiles).values(students.map(row => ({ personId: row.id }))).returning();
        const enroll = (studentProfileId: string, sectionId: string) => ({
          studentProfileId, sectionId, programId: program!.id, organizationId: school.organizationId,
          schoolYearId: year!.id, kind: "section" as const, status: "active" as const,
        });
        await tx.insert(s.enrollments).values(profiles.slice(0, 20).flatMap(row => classes.map(section => enroll(row.id, section.id))));
        expect(await roomCoverageOccupancy(tx, coverage!)).toBe(20);
        await tx.insert(s.enrollments).values(enroll(profiles[20]!.id, classes[0]!.id));
        expect(await roomCoverageOccupancy(tx, coverage!)).toBe(21);
        const records = await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, input.id), eq(s.domainEvents.eventType, EventTypes.RoomCoverageScheduled)));
        expect(records).toHaveLength(2);
        const audits = await tx.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, input.id));
        expect(audits).toHaveLength(2);
        await tx.update(s.accountPersonGrants).set({ active: false }).where(eq(s.accountPersonGrants.id, grant!.id));
        await expect(activeRoomCoverageSectionIds(tx, staff, program!.id, tuesday)).rejects.toThrow("current room facilitator identity");
        await tx.update(s.accountPersonGrants).set({ active: true }).where(eq(s.accountPersonGrants.id, grant!.id));
        await tx.update(s.roomCoverageSchedules).set({ retiredAt: new Date() }).where(eq(s.roomCoverageSchedules.id, input.id));
        expect(await siteUsesRoomCoverage(tx, school.siteId)).toBe(true);
        expect(await activeRoomCoverageSectionIds(tx, staff, program!.id, tuesday)).toEqual([]);
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(checked).toBe(true);
  }, 60_000);
});
