import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { roleCapabilities } from "@/domain/access-context";
import { emptyApplicationPacket } from "@/domain/application-packet";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Transaction | undefined, actor: undefined as AccessContext | undefined,
  request: new Request("http://localhost"), failEvent: "",
}));
vi.mock("@/db/client", () => ({
  get db() { if (!state.tx) throw new Error("Family application test requires rollback isolation"); return state.tx; },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request }));
vi.mock("@/modules/identity/command-context.server", async original => {
  const actual = await original<typeof import("@/modules/identity/command-context.server")>();
  return { ...actual, getCommandContext: (request: Request) => state.actor ?? actual.getCommandContext(request) };
});
vi.mock("@/platform/mutation", async original => {
  const actual = await original<typeof import("@/platform/mutation")>();
  return { ...actual, emitEvent: async (...args: Parameters<typeof actual.emitEvent>) => {
    if (args[1].eventType === state.failEvent) throw new Error("Injected applicant outbox failure");
    return actual.emitEvent(...args);
  } };
});
const integration = process.env.APP_ENV === "test" && process.env.NODE_ENV === "test" &&
  process.env.CAN_TEST_DB_WRITES_ENABLED === "true" && Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.DATABASE_URL === process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("family applications through canonical admissions", () => {
  it("verifies email, saves and submits owned drafts, enforces scope and hands off the same records", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const flow = await import("@/modules/enrollment/family-application.functions");
    const { registerApplicant } = await import("@/modules/identity/applicant-access.server");
    const { redeemOneTimeAccess } = await import("@/modules/identity/passwordless-access.server");
    const { getCommandContext } = await vi.importActual<typeof import("@/modules/identity/command-context.server")>("@/modules/identity/command-context.server");
    const intake = await import("@/modules/enrollment/admissions-intake.functions");
    const rollback = new Error("rollback-family-application");
    const suffix = crypto.randomUUID();
    let accountId = "", applicationId = "";
    try {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "family-application-test-pepper-not-a-real-secret");
      vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://school.example.invalid");
      await database.transaction(async tx => {
        state.tx = tx;
        const [org] = await tx.insert(s.organizations).values({
          type: "christian_school", name: "Applicant School", slug: "applicant-" + suffix,
        }).returning();
        const [site] = await tx.insert(s.sites).values({ organizationId: org!.id, name: "Applicant Site", slug: suffix }).returning();
        const [jurisdiction] = await tx.insert(s.jurisdictions).values({ code: suffix, name: "Applicant jurisdiction" }).returning();
        const [program] = await tx.insert(s.programs).values({
          organizationId: org!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id, type: "full_school",
          status: "active", name: "Applicant program", slug: suffix, gradeRange: { min: "6", max: "12" },
          academicProviderOrganizationId: org!.id, creditIssuingOrganizationId: org!.id,
        }).returning();
        const [registrar] = await tx.insert(s.people).values({ legalFirstName: "School", legalLastName: "Registrar" }).returning();
        const registrarActor: AccessContext = {
          actorPersonId: registrar!.id, accountId: crypto.randomUUID(), sessionId: crypto.randomUUID(),
          grantId: crypto.randomUUID(), role: "registrar", capabilities: new Set(roleCapabilities.registrar),
          scope: { organizationIds: [org!.id], siteIds: [site!.id], programIds: [program!.id] },
        };
        state.actor = registrarActor;
        expect((await flow.listApplicationPrograms()).some(p => p.id === program!.id)).toBe(false);
        const email = `family-${suffix}@example.test`;
        const signup = { programId: program!.id, firstName: "Pat", lastName: "Example", email };
        const sender = vi.fn(async (_message: { to: string; accessUrl: string }) => {});
        await expect(registerApplicant(signup, sender)).rejects.toThrow("not accepting");
        state.actor = { ...registrarActor, scope: { organizationIds: [], siteIds: [], programIds: [] } };
        await expect(flow.setOnlineApplications({ data: { programId: program!.id, open: true } })).rejects.toThrow();
        state.actor = registrarActor;
        await flow.setOnlineApplications({ data: { programId: program!.id, open: true } });
        expect((await flow.listApplicationPrograms()).some(p => p.id === program!.id)).toBe(true);
        await registerApplicant(signup, sender);
        expect(sender).toHaveBeenCalledTimes(1);
        const [account] = await tx.select().from(s.accessAccounts).where(eq(s.accessAccounts.emailNormalized, email));
        accountId = account!.id;
        expect(account!.emailVerifiedAt).toBeNull();
        const [grant] = await tx.select().from(s.accountPersonGrants).where(eq(s.accountPersonGrants.accountId, accountId));
        expect(grant!.role).toBe("applicant");
        const { hashAccessSecret, accessSessionCookie } = await import("@/domain/access-tokens");
        const unverifiedSecret = "unverified-applicant-session-" + crypto.randomUUID();
        await tx.insert(s.accessSessions).values({
          accountId, activeGrantId: grant!.id,
          secretHash: hashAccessSecret(unverifiedSecret, process.env.CAN_ACCESS_TOKEN_PEPPER!),
          expiresAt: new Date(Date.now() + 60_000),
        });
        await expect(getCommandContext(new Request("http://localhost", {
          headers: { cookie: `${accessSessionCookie}=${unverifiedSecret}` },
        }))).rejects.toThrow("verified applicant email");
        // Registration retry must neither duplicate identity nor send unlimited email.
        await registerApplicant(signup, sender);
        expect(sender).toHaveBeenCalledTimes(1);
        const token = new URL(sender.mock.calls[0]![0].accessUrl).hash.slice("#token=".length);
        const login = await redeemOneTimeAccess(token);
        await expect(redeemOneTimeAccess(token)).rejects.toThrow("Invalid or expired");
        state.actor = undefined;
        state.request = new Request("http://localhost", { headers: { cookie: login.setCookie.split(";")[0]! } });
        const actor = await getCommandContext(state.request);
        expect(actor.role).toBe("applicant");
        expect([...actor.capabilities]).toEqual(["enrollment.apply"]);
        expect(await flow.joinApplicationSchool({ data: { programId: program!.id } })).toEqual({ grantId: grant!.id });
        state.actor = { ...actor, role: "teacher", capabilities: new Set(roleCapabilities.teacher) };
        expect(await flow.joinApplicationSchool({ data: { programId: program!.id } })).toEqual({ grantId: grant!.id });
        state.actor = undefined;
        await tx.update(s.accountPersonGrants).set({ active: false }).where(eq(s.accountPersonGrants.id, grant!.id));
        await expect(flow.listMyApplications()).rejects.toThrow();
        await tx.update(s.accountPersonGrants).set({ active: true }).where(eq(s.accountPersonGrants.id, grant!.id));
        const packet = emptyApplicationPacket();
        const details = { programId: program!.id, requestId: crypto.randomUUID(), studentFirstName: "Lee",
          studentLastName: "Example", gradeLevel: "9" as const, statement: "We value a supportive school.", packet };
        const draft = await flow.saveFamilyApplication({ data: details });
        applicationId = draft.applicationId;
        expect(await flow.saveFamilyApplication({ data: details })).toEqual(draft);
        await expect(flow.saveFamilyApplication({ data: { ...details, studentFirstName: "Changed" } }))
          .rejects.toThrow("different application details");
        await expect(flow.saveFamilyApplication({ data: { ...details, requestId: crypto.randomUUID() } }))
          .rejects.toThrow("already exists");
        await expect(flow.saveFamilyApplication({ data: { ...details, requestId: crypto.randomUUID(), gradeLevel: "2" } }))
          .rejects.toThrow("grade offered");
        let [visible] = await flow.listMyApplications();
        expect(visible).toMatchObject({ id: applicationId, draft: true, verified: false, firstName: "Lee" });
        expect(visible).not.toHaveProperty("metadata");
        expect(visible).not.toHaveProperty("decisionNote");
        await expect(flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 1, confirmed: true } }))
          .rejects.toThrow("Complete the application packet");
        const [packetJourney] = await tx.select().from(s.journeys).where(and(
          eq(s.journeys.participantType, "admissions_application"), eq(s.journeys.participantId, applicationId),
        ));
        expect(packetJourney).toMatchObject({ status: "in_progress", definitionVersion: "1" });
        expect(await tx.select().from(s.journeys).where(and(
          eq(s.journeys.participantType, "application"), eq(s.journeys.participantId, applicationId),
        ))).toEqual([]);
        const [app] = await tx.select().from(s.applications).where(eq(s.applications.id, applicationId));
        const [student] = await tx.select().from(s.studentProfiles).where(eq(s.studentProfiles.id, app!.studentProfileId));
        const [relationship] = await tx.select().from(s.guardianRelationships).where(and(
          eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId!),
          eq(s.guardianRelationships.studentPersonId, student!.personId)));
        expect(relationship).toMatchObject({ canViewAcademics: false, canManageEnrollment: false, canSubmitAttendanceExcuse: false });
        const { authorizeEnrollmentApplication } = await import("@/modules/enrollment/enrollment-access.server");
        await expect(authorizeEnrollmentApplication(actor, applicationId)).rejects.toThrow();
        state.actor = { ...actor, actorPersonId: registrar!.id };
        expect(await flow.listMyApplications()).toEqual([]);
        await expect(flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 1, confirmed: true } })).rejects.toThrow();
        state.actor = { ...actor, scope: { ...actor.scope, programIds: [] } };
        await expect(flow.saveFamilyApplication({ data: details })).rejects.toThrow();
        state.actor = registrarActor;
        await expect(intake.transitionAdmissionsStage({ data: { applicationId, decision: "application" } }))
          .rejects.toThrow("must submit");
        state.actor = undefined;
        const completePacket = {
          ...packet, schoolYear: "2026-2027",
          student: { middleName: "", preferredName: "Lee", birthDate: "2011-04-12", primaryLanguage: "English" },
          households: [{ name: "Example Household", address: { line1: "123 Example Lane", line2: "", city: "Example City",
            region: "CA", postalCode: "90000", country: "US" }, contacts: [{ firstName: "Pat", lastName: "Example",
            relationship: "Parent", email, phone: "202-555-0100" }] }],
          history: { firstSchool: false, schools: [{ name: "Example Middle School", location: "Example City, US", grade: "8",
            from: "2023-08-01", to: "2026-06-01", reasonForLeaving: "Moving to high school" }],
            learningInterests: "Science and music", additionalInformation: "" },
        };
        await flow.saveFamilyApplication({ data: { ...details, packet: completePacket, applicationId, expectedVersion: 1, statement: "Updated interest" } });
        const [readyJourney] = await tx.select().from(s.journeys).where(eq(s.journeys.id, packetJourney!.id));
        expect(readyJourney!.status).toBe("ready");
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, packetJourney!.id), eq(s.domainEvents.eventType, "JourneyReady"),
        ))).toHaveLength(1);
        const requirements = await tx.select().from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId, packetJourney!.id));
        expect(requirements).toHaveLength(3);
        expect(requirements.every(requirement => requirement.status === "complete")).toBe(true);
        await expect(flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 1, confirmed: true } }))
          .rejects.toThrow("Draft changed");
        state.failEvent = "ApplicationSubmitted";
        await expect(flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 2, confirmed: true } }))
          .rejects.toThrow("outbox failure");
        [visible] = await flow.listMyApplications();
        expect(visible!.draft).toBe(true);
        state.failEvent = "";
        await flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 2, confirmed: true } });
        await flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 2, confirmed: true } });
        expect(await flow.listMyApplications()).toEqual([expect.objectContaining({ id: applicationId, draft: false, stage: "application" })]);
        await expect(flow.saveFamilyApplication({ data: { ...details, applicationId, expectedVersion: 2 } }))
          .rejects.toThrow("cannot be edited");
        const sibling = await flow.saveFamilyApplication({ data: {
          ...details, packet: undefined, requestId: crypto.randomUUID(), studentFirstName: "Robin",
        } });
        const [siblingApp] = await tx.select().from(s.applications).where(eq(s.applications.id, sibling.applicationId));
        expect(siblingApp!.householdId).toBe(app!.householdId);
        expect(siblingApp!.studentProfileId).not.toBe(app!.studentProfileId);
        expect((await flow.listMyApplications()).find(row => row.id === sibling.applicationId)!.packet).toBeNull();
        await expect(flow.submitFamilyApplication({ data: { applicationId: sibling.applicationId, expectedVersion: 1, confirmed: true } }))
          .rejects.toThrow("Complete the application packet");
        const siblingInput = { ...details, studentFirstName: "Robin", applicationId: sibling.applicationId };
        await flow.saveFamilyApplication({ data: { ...siblingInput, packet: completePacket, expectedVersion: 1 } });
        await flow.saveFamilyApplication({ data: { ...siblingInput, packet: undefined, expectedVersion: 2 } });
        expect((await flow.listMyApplications()).find(row => row.id === sibling.applicationId)!.packet).toEqual(completePacket);
        const regressed = structuredClone(completePacket);
        regressed.households[0]!.address.city = "";
        await flow.saveFamilyApplication({ data: { ...siblingInput, packet: regressed, expectedVersion: 3 } });
        const [siblingJourney] = await tx.select().from(s.journeys).where(and(
          eq(s.journeys.participantType, "admissions_application"), eq(s.journeys.participantId, sibling.applicationId),
        ));
        expect(siblingJourney!.status).toBe("in_progress");
        const [familyRequirement] = await tx.select().from(s.journeyRequirements).where(and(
          eq(s.journeyRequirements.journeyId, siblingJourney!.id), eq(s.journeyRequirements.key, "family"),
        ));
        expect(familyRequirement!.status).toBe("needs_you");
        await tx.delete(s.householdMemberships).where(and(
          eq(s.householdMemberships.householdId, app!.householdId),
          eq(s.householdMemberships.personId, actor.actorPersonId!),
        ));
        expect(await flow.listMyApplications()).toEqual([]);
        await expect(flow.submitFamilyApplication({ data: { applicationId, expectedVersion: 2, confirmed: true } }))
          .rejects.toThrow("household");
        await tx.insert(s.householdMemberships).values({
          householdId: app!.householdId, personId: actor.actorPersonId!, relationshipLabel: "guardian",
        });
        const submittedEvents = await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, applicationId), eq(s.domainEvents.eventType, "ApplicationSubmitted")));
        expect(submittedEvents).toHaveLength(1);
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, packetJourney!.id), eq(s.domainEvents.eventType, "JourneyReady"),
        ))).toHaveLength(1);
        state.actor = registrarActor;
        expect(await intake.listAdmissionsIntake()).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: applicationId, applicantDraft: false, applicantStatement: "Updated interest",
            applicationPacket: completePacket }),
        ]));
        await intake.verifyAdmissionsGuardianRelationship({ data: {
          applicationId, method: "verified_school_record", evidenceNote: "Synthetic test verification only",
        } });
        await intake.provisionInquiryGuardianAccount({ data: { applicationId } });
        const finalGrants = await tx.select().from(s.accountPersonGrants).where(eq(s.accountPersonGrants.accountId, accountId));
        expect(finalGrants.map(g => g.role).sort()).toEqual(["applicant", "guardian"]);
        expect(new Set(finalGrants.map(g => g.personId)).size).toBe(1);
        expect(await tx.select().from(s.enrollments).where(eq(s.enrollments.studentProfileId, app!.studentProfileId))).toEqual([]);
        await flow.setOnlineApplications({ data: { programId: program!.id, open: false } });
        state.actor = undefined;
        await expect(flow.saveFamilyApplication({ data: { ...details, requestId: crypto.randomUUID(), studentFirstName: "Sibling" } }))
          .rejects.toThrow("not accepting");
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { state.tx = undefined; state.actor = undefined; state.failEvent = ""; vi.unstubAllEnvs(); }
    expect(accountId).not.toBe("");
    expect(await database.select().from(s.accessAccounts).where(eq(s.accessAccounts.id, accountId))).toEqual([]);
    expect(await database.select().from(s.applications).where(eq(s.applications.id, applicationId))).toEqual([]);
  }, 120_000);

  it("creates new tenant-bound .demo applicant access without email or guardian privileges", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const { LOCAL_DEMO_ADMIN } = await import("@/domain/local-demo-access");
    const { registerApplicant } = await import("@/modules/identity/applicant-access.server");
    const { getCommandContext } = await vi.importActual<typeof import("@/modules/identity/command-context.server")>("@/modules/identity/command-context.server");
    const rollback = new Error("rollback-demo-applicant");
    try {
      vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "true"); vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "family-demo-test-pepper-not-a-real-secret");
      await database.transaction(async tx => {
        state.tx = tx;
        const [program] = await tx.select().from(s.programs).where(and(
          eq(s.programs.organizationId, LOCAL_DEMO_ADMIN.organizationId), eq(s.programs.siteId, LOCAL_DEMO_ADMIN.siteId),
          eq(s.programs.status, "active"))).limit(1);
        if (!program) throw new Error("Seed the Valor School baseline on the isolated database");
        await tx.update(s.programs).set({ metadata: { ...program.metadata, admissionsOpen: true } }).where(eq(s.programs.id, program.id));
        const sender = vi.fn(async () => { throw new Error("Demo must never send email"); });
        const input = { programId: program.id, firstName: "Demo", lastName: "Applicant",
          email: `applicant-${crypto.randomUUID()}@valorschool.demo`, code: "000000" };
        await expect(registerApplicant({ ...input, code: "123456" }, sender)).rejects.toThrow("code is invalid");
        await expect(registerApplicant({ ...input, email: "authentic@example.test" }, sender))
          .rejects.toThrow("Use a @valorschool.demo");
        await expect(registerApplicant({ ...input, email: "other@unrelated.demo" }, sender))
          .rejects.toThrow("Use a @valorschool.demo");
        const login = await registerApplicant(input, sender);
        expect(login?.role).toBe("applicant");
        expect(sender).not.toHaveBeenCalled();
        const actor = await getCommandContext(new Request("http://localhost", { headers: { cookie: login!.setCookie.split(";")[0]! } }));
        expect(actor).toMatchObject({ role: "applicant", scope: { organizationIds: [LOCAL_DEMO_ADMIN.organizationId] } });
        expect(actor.capabilities.has("guardian:read")).toBe(false);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    finally { state.tx = undefined; vi.unstubAllEnvs(); }
  }, 120_000);
});
