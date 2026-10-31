import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Transaction | undefined,
  request: undefined as Request | undefined,
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
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (!state.request) throw new Error("Student revocation tests require an actor request");
    return state.request;
  },
  setResponseHeader: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Student revocation tests must stay in the rollback transaction");
    return state.tx;
  },
}));

const PEPPER = "student-revocation-integration-pepper-not-a-real-secret";
const integration = process.env.DATABASE_URL ? describe : describe.skip;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing student revocation fixture row");
  return row;
}

/** A real session row so the REAL getCommandContext resolves this account/grant. */
async function openSession(tx: Transaction, accountId: string, grantId: string): Promise<Request> {
  const s = await import("@/db/schema");
  const { issueOpaqueSecret, hashAccessSecret, accessSessionCookie } = await import("@/domain/access-tokens");
  const secret = issueOpaqueSecret();
  await tx.insert(s.accessSessions).values({
    accountId,
    activeGrantId: grantId,
    secretHash: hashAccessSecret(secret, PEPPER),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  });
  return new Request("http://localhost", { headers: { cookie: `${accessSessionCookie}=${secret}` } });
}

/** School with a program so an org-wide registrar resolves a non-empty Program scope. */
async function seedSchool(tx: Transaction, suffix: string, label: string) {
  const s = await import("@/db/schema");
  const org = first(await tx.insert(s.organizations).values({
    type: "christian_school", name: `${label} School ${suffix}`, slug: `${label.toLowerCase()}-school-${suffix}`,
  }).returning());
  const site = first(await tx.insert(s.sites).values({
    organizationId: org.id, name: `${label} Campus`, slug: `${label.toLowerCase()}-site-${suffix}`,
  }).returning());
  const jurisdiction = first(await tx.insert(s.jurisdictions).values({
    code: `${label.toLowerCase()}-${suffix}`, name: `${label} test jurisdiction`,
  }).returning());
  const program = first(await tx.insert(s.programs).values({
    organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
    type: "church_hosted_academy", status: "active", name: `${label} Academy`,
    slug: `${label.toLowerCase()}-${suffix}`, gradeRange: { min: "9", max: "12" },
    deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
    hostOrganizationId: org.id,
    academicProviderOrganizationId: org.id,
    creditIssuingOrganizationId: org.id,
  }).returning());
  return { org, site, jurisdiction, program };
}

async function seedRegistrar(tx: Transaction, suffix: string, orgId: string, label: string) {
  const s = await import("@/db/schema");
  const person = first(await tx.insert(s.people).values({
    legalFirstName: label, legalLastName: `Registrar-${suffix}`,
  }).returning());
  const account = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `${label.toLowerCase()}-registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
  }).returning());
  const grant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id, personId: person.id, role: "registrar",
    organizationId: orgId, siteId: null,
  }).returning());
  return { person, account, grant };
}

/**
 * A consented student learning account: student Person + Profile, guardian
 * Person, accepted Application, guardian consent row, account + student grant.
 */
async function seedStudentAccess(
  tx: Transaction, suffix: string, orgId: string, siteId: string, programId: string,
  consentStatus: string,
) {
  const s = await import("@/db/schema");
  const studentPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Learner", legalLastName: `Student-${suffix}`,
  }).returning());
  const guardianPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Learner", legalLastName: `Guardian-${suffix}`,
  }).returning());
  const profile = first(await tx.insert(s.studentProfiles).values({
    personId: studentPerson.id, gradeLevel: "10",
  }).returning());
  const household = first(await tx.insert(s.households).values({
    displayName: `Learner Household ${suffix}`,
  }).returning());
  const application = first(await tx.insert(s.applications).values({
    householdId: household.id, studentProfileId: profile.id, programId,
    stage: "accepted", idempotencyKey: `student-revocation:${suffix}`,
    submittedByPersonId: guardianPerson.id,
  }).returning());
  const consent = first(await tx.insert(s.studentAccessConsents).values({
    applicationId: application.id, studentProfileId: profile.id,
    guardianPersonId: guardianPerson.id, programId, siteId,
    studentEmail: `learner-${suffix}@example.invalid`,
    consentStatement: "Test guardian consent statement",
    signedAt: new Date(Date.now() - 86400_000),
    status: consentStatus,
    ...(consentStatus === "approved" ? {
      reviewedByPersonId: guardianPerson.id, reviewedAt: new Date(Date.now() - 3600_000),
    } : {}),
  }).returning());
  const account = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `learner-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
  }).returning());
  const grant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id, personId: studentPerson.id, role: "student",
    organizationId: orgId, siteId,
  }).returning());
  return { studentPerson, guardianPerson, profile, application, consent, account, grant };
}

integration("student learning access revocation", () => {
  it("revokes grant and bound sessions idempotently, restores with approved consent, and leaves the consent row untouched", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-student-access-revocation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { revokeStudentLearningAccess, restoreStudentLearningAccess } =
          await import("@/modules/enrollment/student-access-revocation.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site, program } = await seedSchool(tx, suffix, "Learner");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Learner");
        const student = await seedStudentAccess(tx, suffix, org.id, site.id, program.id, "approved");

        const registrarRequest = await openSession(tx, registrar.account.id, registrar.grant.id);
        const studentRequest = await openSession(tx, student.account.id, student.grant.id);
        const baseline = await getCommandContext(studentRequest);
        expect(baseline).toMatchObject({ role: "student", grantId: student.grant.id });

        state.request = registrarRequest;
        // A registrar can never revoke their own active grant through this path.
        await expect(revokeStudentLearningAccess({ data: {
          grantId: registrar.grant.id,
          reason: "Self revocation must be refused by the registrar guard",
        } })).rejects.toThrow("own active grant");

        const revoked = await revokeStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Safeguarding hold pending family identity re-verification",
        } });
        expect(revoked).toEqual({ revoked: true });

        // The revoked session immediately fails command-context resolution.
        await expect(getCommandContext(studentRequest)).rejects.toThrow("authenticated session");
        const boundSessions = await tx.select({ revokedAt: s.accessSessions.revokedAt })
          .from(s.accessSessions).where(and(
            eq(s.accessSessions.accountId, student.account.id),
            eq(s.accessSessions.activeGrantId, student.grant.id),
          ));
        expect(boundSessions.length).toBeGreaterThan(0);
        expect(boundSessions.every(row => row.revokedAt !== null)).toBe(true);
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, student.grant.id))))
          .toEqual({ active: false });

        // Revocation never modifies the independently reviewed consent row.
        const consentAfter = first(await tx.select().from(s.studentAccessConsents)
          .where(eq(s.studentAccessConsents.id, student.consent.id)));
        expect(consentAfter).toEqual({ ...student.consent, updatedAt: consentAfter.updatedAt });
        expect(consentAfter.status).toBe("approved");
        // The student identity record stays active.
        expect(first(await tx.select({ active: s.people.active })
          .from(s.people).where(eq(s.people.id, student.studentPerson.id))))
          .toEqual({ active: true });

        const revokeAudits = await tx.select({ before: s.auditEvents.before, after: s.auditEvents.after })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "student.access.revoked"),
            eq(s.auditEvents.resourceType, "account_person_grant"),
            eq(s.auditEvents.resourceId, student.grant.id),
          ));
        expect(revokeAudits).toHaveLength(1);
        expect(revokeAudits[0]).toMatchObject({ before: { active: true }, after: { active: false } });
        const revokeEvents = await tx.select({ eventType: s.domainEvents.eventType })
          .from(s.domainEvents).where(and(
            eq(s.domainEvents.aggregateType, "account_person_grant"),
            eq(s.domainEvents.aggregateId, student.grant.id),
            eq(s.domainEvents.eventType, "StudentLearningAccessRevoked"),
          ));
        expect(revokeEvents).toHaveLength(1);
        const securityAudits = await tx.select({ context: s.auditEvents.context })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "identity.sessions.revoked_grant"),
            eq(s.auditEvents.resourceType, "account"),
            eq(s.auditEvents.resourceId, student.account.id),
          ));
        expect(securityAudits).toHaveLength(1);
        expect(securityAudits[0]!.context).toMatchObject({ grantId: student.grant.id, revokedCount: 1 });

        // Repeat revocation is an idempotent no-op with no duplicate history.
        const repeated = await revokeStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Duplicate revocation attempt must not append audit history",
        } });
        expect(repeated).toEqual({ revoked: false });
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "student.access.revoked"),
          eq(s.auditEvents.resourceId, student.grant.id),
        ))).length).toBe(1);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, student.grant.id),
          eq(s.domainEvents.eventType, "StudentLearningAccessRevoked"),
        ))).length).toBe(1);

        // Restoration reactivates the grant but never resurrects revoked sessions.
        const restored = await restoreStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Identity re-verified by the school registrar in person",
        } });
        expect(restored).toEqual({ restored: true });
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, student.grant.id))))
          .toEqual({ active: true });
        await expect(getCommandContext(studentRequest)).rejects.toThrow("authenticated session");
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "student.access.restored"),
          eq(s.auditEvents.resourceId, student.grant.id),
        ))).length).toBe(1);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, student.grant.id),
          eq(s.domainEvents.eventType, "StudentLearningAccessRestored"),
        ))).length).toBe(1);

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("blocks restoration when the guardian consent is not approved", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-student-restore-consent-guard");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { revokeStudentLearningAccess, restoreStudentLearningAccess } =
          await import("@/modules/enrollment/student-access-revocation.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site, program } = await seedSchool(tx, suffix, "Consent");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Consent");
        const student = await seedStudentAccess(tx, suffix, org.id, site.id, program.id, "pending_review");

        state.request = await openSession(tx, registrar.account.id, registrar.grant.id);
        const revoked = await revokeStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Consent withdrawn pending a new independent review",
        } });
        expect(revoked).toEqual({ revoked: true });

        await expect(restoreStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Restore attempt without an approved guardian consent",
        } })).rejects.toThrow("approved guardian consent");
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, student.grant.id))))
          .toEqual({ active: false });
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "student.access.restored"),
          eq(s.auditEvents.resourceId, student.grant.id),
        ))).length).toBe(0);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, student.grant.id),
          eq(s.domainEvents.eventType, "StudentLearningAccessRestored"),
        ))).length).toBe(0);

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("denies non-registrar actors and registrars outside the grant scope", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-student-revocation-denials");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { revokeStudentLearningAccess } =
          await import("@/modules/enrollment/student-access-revocation.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site, program } = await seedSchool(tx, suffix, "Blocked");
        const student = await seedStudentAccess(tx, suffix, org.id, site.id, program.id, "approved");

        // Non-registrar: the student cannot run the registrar-only revocation.
        state.request = await openSession(tx, student.account.id, student.grant.id);
        await expect(revokeStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "A student must never revoke access grants themselves",
        } })).rejects.toThrow("real school registrar");

        // Wrong scope: a registrar of another organization cannot touch this grant.
        const other = await seedSchool(tx, suffix, "Other");
        const otherRegistrar = await seedRegistrar(tx, suffix, other.org.id, "Other");
        state.request = await openSession(tx, otherRegistrar.account.id, otherRegistrar.grant.id);
        await expect(revokeStudentLearningAccess({ data: {
          grantId: student.grant.id,
          reason: "Out of scope registrar revocation must be refused",
        } })).rejects.toThrow("student grant organization scope");

        // Neither denial mutated the grant or its sessions.
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, student.grant.id))))
          .toEqual({ active: true });
        expect(await tx.select({ id: s.accessSessions.id }).from(s.accessSessions).where(and(
          eq(s.accessSessions.accountId, student.account.id),
          isNull(s.accessSessions.revokedAt),
        ))).not.toHaveLength(0);

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);
});
