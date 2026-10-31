import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { resolveAccessContext, type AccessContext, type VerifiedAccessGrant } from "@/domain/access-context";

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
    if (!state.request) throw new Error("Staff revocation tests require an actor request");
    return state.request;
  },
  setResponseHeader: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Staff revocation tests must stay in the rollback transaction");
    return state.tx;
  },
}));

const PEPPER = "staff-revocation-integration-pepper-not-a-real-secret";
const integration = process.env.DATABASE_URL ? describe : describe.skip;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing staff revocation fixture row");
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

/** Hand-built actor backed by a real grant row's verified identifiers. */
function actorFromGrant(grant: VerifiedAccessGrant, programIds: string[] = []): AccessContext {
  const context = resolveAccessContext(
    { accountId: grant.accountId, sessionId: "staff-revocation-test", activeGrantId: grant.id },
    [grant],
  );
  context.scope.programIds = programIds;
  return context;
}

/** Church-hosted CAN program with an approved, independently verified operating authorization. */
async function seedChurchCanProgram(tx: Transaction, suffix: string) {
  const s = await import("@/db/schema");
  const can = first(await tx.insert(s.organizations).values({
    type: "can_network", name: `CAN Revocation ${suffix}`, slug: `can-revocation-${suffix}`,
  }).returning());
  const church = first(await tx.insert(s.organizations).values({
    type: "church", name: `Church Revocation ${suffix}`, slug: `church-revocation-${suffix}`,
  }).returning());
  const site = first(await tx.insert(s.sites).values({
    organizationId: church.id, name: "Revocation Campus", slug: `revocation-site-${suffix}`,
  }).returning());
  const jurisdiction = first(await tx.insert(s.jurisdictions).values({
    code: `rev-${suffix}`, name: "Revocation test jurisdiction",
  }).returning());
  const program = first(await tx.insert(s.programs).values({
    organizationId: church.id, siteId: site.id, jurisdictionId: jurisdiction.id,
    type: "church_hosted_academy", status: "active", name: "Revocation Academy",
    slug: `revocation-${suffix}`, gradeRange: { min: "9", max: "12" },
    deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
    hostOrganizationId: church.id,
    academicProviderOrganizationId: can.id,
    creditIssuingOrganizationId: can.id,
  }).returning());
  const registrarPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Host", legalLastName: `Registrar-${suffix}`,
  }).returning());
  const stewardPerson = first(await tx.insert(s.people).values({
    legalFirstName: "CAN", legalLastName: `Steward-${suffix}`,
  }).returning());
  const verifierPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Independent", legalLastName: `Verifier-${suffix}`,
  }).returning());
  const registrarAccount = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
  }).returning());
  const registrarGrant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: registrarAccount.id, personId: registrarPerson.id, role: "registrar",
    organizationId: church.id, siteId: site.id,
  }).returning());
  const agreement = first(await tx.insert(s.documents).values({
    subjectType: "program", subjectId: program.id,
    category: "program_site_operating_agreement", fileName: "signed-operating-agreement.pdf",
    storageProvider: "synthetic-test", storageKey: `agreement-${suffix}`,
    uploadedByPersonId: registrarPerson.id,
    verifiedAt: new Date(Date.now() - 3600_000), verifiedByPersonId: verifierPerson.id,
    metadata: {
      hostOrganizationId: church.id, institutionOrganizationId: can.id,
      siteId: site.id, creditIssuingOrganizationId: can.id,
      hostSignatureVerified: true, institutionSignatureVerified: true,
      authorizedServices: ["onsite_supervision"],
    },
  }).returning());
  await tx.insert(s.programSiteAuthorizations).values({
    programId: program.id, siteId: site.id,
    hostOrganizationId: church.id, institutionOrganizationId: can.id,
    version: 1, status: "approved", services: ["onsite_supervision"],
    requestedByPersonId: registrarPerson.id,
    evidenceDocumentId: agreement.id,
    effectiveFrom: new Date(Date.now() - 3600_000),
    effectiveThrough: new Date(Date.now() + 180 * 86400_000),
    reviewedByPersonId: stewardPerson.id, reviewedAt: new Date(Date.now() - 1800_000),
    reviewReason: "Independent verification of both contracting organizations.",
  });
  return { can, church, site, program, registrarPerson, registrarAccount, registrarGrant };
}

integration("staff revocation enforcement", () => {
  it("setGrantActive strips and restores command-context access and guards self-lockout", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-staff-grant-revocation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { setGrantActive } = await import("@/modules/identity/admin.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const org = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: `Grant School ${suffix}`, slug: `grant-school-${suffix}`,
        }).returning());
        const registrarPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Grant", legalLastName: `Registrar-${suffix}`,
        }).returning());
        const registrarAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `grant-registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const registrarGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: registrarAccount.id, personId: registrarPerson.id, role: "registrar",
          organizationId: org.id, siteId: null,
        }).returning());
        const staffPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Grant", legalLastName: `Staff-${suffix}`,
        }).returning());
        const staffAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `grant-staff-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const staffGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: staffAccount.id, personId: staffPerson.id, role: "site_staff",
          organizationId: org.id, siteId: null,
        }).returning());

        const registrarRequest = await openSession(tx, registrarAccount.id, registrarGrant.id);
        const staffRequest = await openSession(tx, staffAccount.id, staffGrant.id);
        const baseline = await getCommandContext(staffRequest);
        expect(baseline).toMatchObject({ role: "site_staff", grantId: staffGrant.id });

        state.request = registrarRequest;
        // The self-lockout guard fires before any write.
        await expect(setGrantActive({ data: { grantId: registrarGrant.id, active: false } }))
          .rejects.toThrow("cannot deactivate your own active grant");

        const deactivated = await setGrantActive({ data: { grantId: staffGrant.id, active: false } });
        expect(deactivated).toEqual({ grantId: staffGrant.id, active: false });
        // The deactivated grant immediately strips the resolved role/capabilities.
        await expect(getCommandContext(staffRequest)).rejects.toThrow("active membership");

        const reactivated = await setGrantActive({ data: { grantId: staffGrant.id, active: true } });
        expect(reactivated).toEqual({ grantId: staffGrant.id, active: true });
        const restored = await getCommandContext(staffRequest);
        expect(restored).toMatchObject({ role: "site_staff", grantId: staffGrant.id });
        expect(restored.capabilities.has("onsite.attendance.record")).toBe(true);

        const audits = await tx.select({
          before: s.auditEvents.before, after: s.auditEvents.after,
        }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "admin.grant.set_active"),
          eq(s.auditEvents.resourceType, "account_person_grant"),
          eq(s.auditEvents.resourceId, staffGrant.id),
        ));
        expect(audits).toHaveLength(2);
        expect(audits).toContainEqual({ before: { active: true }, after: { active: false } });
        expect(audits).toContainEqual({ before: { active: false }, after: { active: true } });

        // Wrong role: a site_staff actor can never reach the registrar-only toggle.
        const outsiderPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Grant", legalLastName: `Outsider-${suffix}`,
        }).returning());
        const outsiderAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `grant-outsider-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const outsiderGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: outsiderAccount.id, personId: outsiderPerson.id, role: "site_staff",
          organizationId: org.id, siteId: null,
        }).returning());
        state.request = await openSession(tx, outsiderAccount.id, outsiderGrant.id);
        await expect(setGrantActive({ data: { grantId: staffGrant.id, active: false } }))
          .rejects.toThrow("role: registrar");

        // Wrong scope: a registrar of another organization cannot touch this grant.
        const otherOrg = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: `Other School ${suffix}`, slug: `other-school-${suffix}`,
        }).returning());
        const otherPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Other", legalLastName: `Registrar-${suffix}`,
        }).returning());
        const otherAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `other-registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const otherGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: otherAccount.id, personId: otherPerson.id, role: "registrar",
          organizationId: otherOrg.id, siteId: null,
        }).returning());
        state.request = await openSession(tx, otherAccount.id, otherGrant.id);
        await expect(setGrantActive({ data: { grantId: staffGrant.id, active: false } }))
          .rejects.toThrow("grant organization scope");

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

  it("setSiteLocalDelegation revoke ends requireCurrentSiteLocalDelegate with audit and event evidence", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-site-delegation-revocation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { setSiteLocalDelegation, requireCurrentSiteLocalDelegate, currentSiteDirectorPersonId } =
          await import("@/modules/operations/site-local-delegation.server");
        const suffix = crypto.randomUUID().slice(0, 8);
        const fixture = await seedChurchCanProgram(tx, suffix);
        const { church, site, program } = fixture;
        const registrar = actorFromGrant(fixture.registrarGrant, [program.id]);

        const leaderPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Site", legalLastName: `Leader-${suffix}`,
        }).returning());
        const leaderAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `site-leader-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const leaderGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: leaderAccount.id, personId: leaderPerson.id, role: "site_leader",
          organizationId: church.id, siteId: site.id,
        }).returning());
        const leader = actorFromGrant(leaderGrant, [program.id]);

        const appointed = await setSiteLocalDelegation(registrar, {
          programId: program.id, responsibility: "site_director", action: "appoint",
          personId: leaderPerson.id,
          validThrough: new Date(Date.now() + 30 * 86400_000).toISOString(),
          expectedAssignmentId: null,
        });
        expect(appointed).toMatchObject({ changed: true, responsibility: "site_director" });
        const assignmentId = appointed.assignmentId;
        expect(typeof assignmentId).toBe("string");
        // The named delegate passes the combined grant + duty check before revocation.
        await expect(requireCurrentSiteLocalDelegate(tx, leader, program.id, "site_director"))
          .resolves.toBeUndefined();

        expect(await currentSiteDirectorPersonId(tx, program.id)).toBe(leaderPerson.id);
        // Appointment history alone must not keep routing work to ineligible people.
        await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,leaderGrant.id));
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBeNull();
        await tx.update(s.accountPersonGrants).set({active:true}).where(eq(s.accountPersonGrants.id,leaderGrant.id));
        await tx.update(s.accessAccounts).set({disabled:true}).where(eq(s.accessAccounts.id,leaderAccount.id));
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBeNull();
        await tx.update(s.accessAccounts).set({disabled:false,emailVerifiedAt:null}).where(eq(s.accessAccounts.id,leaderAccount.id));
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBeNull();
        await tx.update(s.accessAccounts).set({emailVerifiedAt:new Date()}).where(eq(s.accessAccounts.id,leaderAccount.id));
        await tx.update(s.people).set({active:false}).where(eq(s.people.id,leaderPerson.id));
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBeNull();
        await tx.update(s.people).set({active:true}).where(eq(s.people.id,leaderPerson.id));
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBe(leaderPerson.id);

        const revoked = await setSiteLocalDelegation(registrar, {
          programId: program.id, responsibility: "site_director", action: "revoke",
          expectedAssignmentId: assignmentId,
        });
        expect(revoked).toEqual({ changed: true, responsibility: "site_director", assignmentId });
        expect(await currentSiteDirectorPersonId(tx, program.id)).toBeNull();
        await expect(requireCurrentSiteLocalDelegate(tx, leader, program.id, "site_director"))
          .rejects.toThrow("effective, named local Site responsibility");

        const audits = await tx.select({
          action: s.auditEvents.action, before: s.auditEvents.before, after: s.auditEvents.after,
        }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "site.local_responsibility.revoked"),
          eq(s.auditEvents.resourceType, "program_responsibility_assignment"),
          eq(s.auditEvents.resourceId, assignmentId!),
        ));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ after: { responsibility: "site_director" } });
        const events = await tx.select({
          eventType: s.domainEvents.eventType, aggregateType: s.domainEvents.aggregateType,
          payload: s.domainEvents.payload,
        }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateType, "program_responsibility_assignment"),
          eq(s.domainEvents.aggregateId, assignmentId!),
          eq(s.domainEvents.eventType, "LocalSiteResponsibilityRevoked"),
        ));
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ payload: { responsibility: "site_director" } });

        // The named duty's roleAssignments row is soft-revoked with the delegation.
        const { activeRoleAssignmentPredicate } =
          await import("@/modules/identity/role-assignment-state.server");
        const dutyLink = first(await tx.select({
          roleAssignmentId: s.programResponsibilityAssignments.responsibleRoleAssignmentId,
        }).from(s.programResponsibilityAssignments)
          .where(eq(s.programResponsibilityAssignments.id, assignmentId!)));
        const dutyRoleId = dutyLink.roleAssignmentId!;
        const revokedDuty = first(await tx.select().from(s.roleAssignments)
          .where(eq(s.roleAssignments.id, dutyRoleId)));
        expect(revokedDuty.capabilities).toEqual([]);
        expect(revokedDuty.metadata).toMatchObject({
          origin: "local_site_delegation", responsibility: "site_director",
          revokedByPersonId: registrar.actorPersonId,
        });
        expect(typeof revokedDuty.metadata?.revokedAt).toBe("string");
        expect(await tx.select({ id: s.roleAssignments.id }).from(s.roleAssignments)
          .where(and(eq(s.roleAssignments.id, dutyRoleId), activeRoleAssignmentPredicate())))
          .toHaveLength(0);

        // Repeat-revoke of the already-ended duty keeps the existing no-op behavior.
        const repeatRevoke = await setSiteLocalDelegation(registrar, {
          programId: program.id, responsibility: "site_director", action: "revoke",
          expectedAssignmentId: assignmentId,
        });
        expect(repeatRevoke).toEqual({ changed: false, responsibility: "site_director", assignmentId });

        // Re-appointment restores the SAME retained row with live capabilities.
        const reappointed = await setSiteLocalDelegation(registrar, {
          programId: program.id, responsibility: "site_director", action: "appoint",
          personId: leaderPerson.id,
          validThrough: new Date(Date.now() + 30 * 86400_000).toISOString(),
          expectedAssignmentId: assignmentId,
        });
        expect(reappointed).toEqual({ changed: true, responsibility: "site_director", assignmentId });
        const restoredLink = first(await tx.select({
          roleAssignmentId: s.programResponsibilityAssignments.responsibleRoleAssignmentId,
        }).from(s.programResponsibilityAssignments)
          .where(eq(s.programResponsibilityAssignments.id, assignmentId!)));
        expect(restoredLink.roleAssignmentId).toBe(dutyRoleId);
        const restoredDuty = first(await tx.select().from(s.roleAssignments)
          .where(eq(s.roleAssignments.id, dutyRoleId)));
        expect(restoredDuty.capabilities).toEqual(["onsite.attendance.record"]);
        expect(restoredDuty.metadata?.revokedAt).toBeNull();
        expect(restoredDuty.metadata?.revocationReason).toBeNull();
        expect(restoredDuty.metadata?.revokedByPersonId).toBeNull();
        expect(await tx.select({ id: s.roleAssignments.id }).from(s.roleAssignments)
          .where(and(eq(s.roleAssignments.id, dutyRoleId), activeRoleAssignmentPredicate())))
          .toHaveLength(1);
        await expect(requireCurrentSiteLocalDelegate(tx, leader, program.id, "site_director"))
          .resolves.toBeUndefined();

        // Wrong role: the delegate cannot run the issuer-side revocation function.
        await expect(setSiteLocalDelegation(leader, {
          programId: program.id, responsibility: "site_director", action: "revoke",
          expectedAssignmentId: assignmentId,
        })).rejects.toThrow("host registrar may delegate only within their verified Site and Program");
        // Wrong scope: the same registrar without this Program in scope is rejected.
        const outOfScope: AccessContext = { ...registrar, scope: { ...registrar.scope, programIds: [] } };
        await expect(setSiteLocalDelegation(outOfScope, {
          programId: program.id, responsibility: "site_director", action: "revoke",
          expectedAssignmentId: assignmentId,
        })).rejects.toThrow("host registrar may delegate only within their verified Site and Program");

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("changeSectionFacilitator revoke removes the section from activeFacilitatorSectionIds", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-section-facilitator-revocation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { changeSectionFacilitator, activeFacilitatorSectionIds } =
          await import("@/modules/operations/site-section-facilitators.server");
        const { createAcademicTimeFixture } = await import("./helpers/academic-time");
        const suffix = crypto.randomUUID().slice(0, 8);
        const fixture = await seedChurchCanProgram(tx, suffix);
        const { church, site, program } = fixture;
        const registrar = actorFromGrant(fixture.registrarGrant, [program.id]);

        const academic = await createAcademicTimeFixture({
          organizationId: church.id, programId: program.id, siteId: site.id, suffix,
        });
        const course = first(await tx.insert(s.courseTemplates).values({
          owningOrganizationId: church.id, code: `rev-${suffix}`,
          title: "Revocation Science", subject: "Science",
        }).returning());
        const courseVersion = first(await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId: course.id, version: 1, status: "published",
        }).returning());
        const section = first(await tx.insert(s.sections).values({
          programId: program.id, siteId: site.id, termId: academic.term.id,
          courseTemplateVersionId: courseVersion.id, code: `sec-${suffix}`, title: "Revocation Section",
        }).returning());
        await tx.insert(s.schoolConfigurationVersions).values({
          programId: program.id, version: 1, deploymentModel: "church_hosted_site", status: "draft",
          config: {
            grades: { min: "9", max: "12" },
            delivery: { onsite: true, asynchronous: true, liveOnline: false, onsiteDaysPerWeek: 2 },
            services: ["onsite_supervision"],
          },
        });

        const facilitatorPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Room", legalLastName: `Facilitator-${suffix}`,
        }).returning());
        const facilitatorAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `room-facilitator-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const facilitatorGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: facilitatorAccount.id, personId: facilitatorPerson.id, role: "room_facilitator",
          organizationId: church.id, siteId: site.id,
        }).returning());
        const facilitator = actorFromGrant(facilitatorGrant, [program.id]);

        const appointed = await changeSectionFacilitator(registrar, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "appoint",
          expectedAssignmentId: null,
          validThrough: new Date(Date.now() + 30 * 86400_000).toISOString(),
        });
        expect(appointed).toMatchObject({ changed: true });
        const assignmentId = appointed.assignmentId;
        expect(await activeFacilitatorSectionIds(tx, facilitator, program.id)).toEqual([section.id]);

        const revoked = await changeSectionFacilitator(registrar, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "revoke",
          expectedAssignmentId: assignmentId,
        });
        expect(revoked).toEqual({ changed: true, assignmentId });
        expect(await activeFacilitatorSectionIds(tx, facilitator, program.id)).toEqual([]);

        const audits = await tx.select({
          action: s.auditEvents.action, after: s.auditEvents.after,
        }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "site.section_facilitator.revoked"),
          eq(s.auditEvents.resourceType, "program_responsibility_assignment"),
          eq(s.auditEvents.resourceId, assignmentId!),
        ));
        expect(audits).toHaveLength(1);
        const events = await tx.select({ eventType: s.domainEvents.eventType })
          .from(s.domainEvents).where(and(
            eq(s.domainEvents.aggregateType, "program_responsibility_assignment"),
            eq(s.domainEvents.aggregateId, assignmentId!),
            eq(s.domainEvents.eventType, "SectionFacilitatorRevoked"),
          ));
        expect(events).toHaveLength(1);

        // The facilitator's roleAssignments row is soft-revoked with the duty.
        const { activeRoleAssignmentPredicate } =
          await import("@/modules/identity/role-assignment-state.server");
        const dutyLink = first(await tx.select({
          roleAssignmentId: s.programResponsibilityAssignments.responsibleRoleAssignmentId,
        }).from(s.programResponsibilityAssignments)
          .where(eq(s.programResponsibilityAssignments.id, assignmentId!)));
        const dutyRoleId = dutyLink.roleAssignmentId!;
        const revokedDuty = first(await tx.select().from(s.roleAssignments)
          .where(eq(s.roleAssignments.id, dutyRoleId)));
        expect(revokedDuty.capabilities).toEqual([]);
        expect(revokedDuty.metadata).toMatchObject({
          origin: "local_section_facilitator", sectionId: section.id,
          revokedByPersonId: registrar.actorPersonId,
        });
        expect(typeof revokedDuty.metadata?.revokedAt).toBe("string");
        expect(await tx.select({ id: s.roleAssignments.id }).from(s.roleAssignments)
          .where(and(eq(s.roleAssignments.id, dutyRoleId), activeRoleAssignmentPredicate())))
          .toHaveLength(0);

        // Repeat-revoke of the already-ended duty keeps the existing no-op behavior.
        const repeatRevoke = await changeSectionFacilitator(registrar, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "revoke",
          expectedAssignmentId: assignmentId,
        });
        expect(repeatRevoke).toEqual({ changed: false, assignmentId });

        // Re-appointment restores the SAME retained row with live capabilities.
        const reappointed = await changeSectionFacilitator(registrar, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "appoint",
          expectedAssignmentId: assignmentId,
          validThrough: new Date(Date.now() + 30 * 86400_000).toISOString(),
        });
        expect(reappointed).toEqual({ changed: true, assignmentId });
        const restoredLink = first(await tx.select({
          roleAssignmentId: s.programResponsibilityAssignments.responsibleRoleAssignmentId,
        }).from(s.programResponsibilityAssignments)
          .where(eq(s.programResponsibilityAssignments.id, assignmentId!)));
        expect(restoredLink.roleAssignmentId).toBe(dutyRoleId);
        const restoredDuty = first(await tx.select().from(s.roleAssignments)
          .where(eq(s.roleAssignments.id, dutyRoleId)));
        expect(restoredDuty.capabilities).toEqual(["onsite.attendance.record"]);
        expect(restoredDuty.metadata?.revokedAt).toBeNull();
        expect(restoredDuty.metadata?.revocationReason).toBeNull();
        expect(restoredDuty.metadata?.revokedByPersonId).toBeNull();
        expect(await activeFacilitatorSectionIds(tx, facilitator, program.id)).toEqual([section.id]);

        // Wrong role: the facilitator cannot run the issuer-side revocation function.
        await expect(changeSectionFacilitator(facilitator, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "revoke",
          expectedAssignmentId: assignmentId,
        })).rejects.toThrow("host registrar may delegate only within their verified Site and Program");
        // Wrong scope: the same registrar without this Program in scope is rejected.
        const outOfScope: AccessContext = { ...registrar, scope: { ...registrar.scope, programIds: [] } };
        await expect(changeSectionFacilitator(outOfScope, {
          sectionId: section.id, personId: facilitatorPerson.id, action: "revoke",
          expectedAssignmentId: assignmentId,
        })).rejects.toThrow("host registrar may delegate only within their verified Site and Program");

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("re-inviting a revoked site_website_editor restores the same roleAssignments row", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-publisher-reinvitation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { inviteStaffMember } = await import("@/modules/identity/admin.functions");
        const { siteWebsitePublisherCapabilities } =
          await import("@/modules/sites/site-publisher-invitation.server");
        const { activeRoleAssignmentPredicate } =
          await import("@/modules/identity/role-assignment-state.server");
        const suffix = crypto.randomUUID().slice(0, 8);

        const church = first(await tx.insert(s.organizations).values({
          type: "church", name: `Publisher Church ${suffix}`, slug: `publisher-church-${suffix}`,
        }).returning());
        const site = first(await tx.insert(s.sites).values({
          organizationId: church.id, name: "Publisher Campus", slug: `publisher-site-${suffix}`,
        }).returning());
        const registrarPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Publisher", legalLastName: `Registrar-${suffix}`,
        }).returning());
        const registrarAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `publisher-registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const registrarGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: registrarAccount.id, personId: registrarPerson.id, role: "registrar",
          organizationId: church.id, siteId: site.id,
        }).returning());
        state.request = await openSession(tx, registrarAccount.id, registrarGrant.id);

        const inviteInput = {
          email: `publisher-${suffix}@example.invalid`,
          firstName: "Web", lastName: `Publisher-${suffix}`,
          role: "site_website_editor" as const, siteId: site.id,
        };
        const invited = await inviteStaffMember({ data: inviteInput });
        expect(invited).toMatchObject({ created: true, pending: true });
        const invitedPersonId = invited.personId;

        const liveAssignment = first(await tx.select().from(s.roleAssignments).where(and(
          eq(s.roleAssignments.personId, invitedPersonId),
          eq(s.roleAssignments.organizationId, church.id),
          eq(s.roleAssignments.siteId, site.id),
          eq(s.roleAssignments.roleKey, "site_website_editor"),
        )));
        const roleAssignmentId = liveAssignment.id;
        expect([...liveAssignment.capabilities].sort())
          .toEqual([...siteWebsitePublisherCapabilities].sort());

        // No revocation path exists for site_website_editor today: set up the
        // revoked state directly, mirroring the soft-revocation convention.
        await tx.update(s.roleAssignments).set({
          capabilities: [],
          metadata: { ...liveAssignment.metadata, revokedAt: new Date().toISOString(),
            revocationReason: "Website publishing duty withdrawn",
            revokedByPersonId: registrarPerson.id },
        }).where(eq(s.roleAssignments.id, roleAssignmentId));
        expect(await tx.select({ id: s.roleAssignments.id }).from(s.roleAssignments)
          .where(and(eq(s.roleAssignments.id, roleAssignmentId), activeRoleAssignmentPredicate())))
          .toHaveLength(0);

        // Keep the account→person link through an unrelated grant and remove
        // the stale invitation grant so re-invitation re-provisions the role.
        await tx.insert(s.accountPersonGrants).values({
          accountId: invited.accountId, personId: invitedPersonId, role: "site_staff",
          organizationId: church.id, siteId: site.id, active: false,
        });
        await tx.delete(s.accountPersonGrants)
          .where(eq(s.accountPersonGrants.id, invited.grantId));

        const reinvited = await inviteStaffMember({ data: inviteInput });
        expect(reinvited).toMatchObject({ created: true, pending: true });
        expect(reinvited.personId).toBe(invitedPersonId);

        // The SAME retained row is restored; no duplicate assignment appears.
        const restored = first(await tx.select().from(s.roleAssignments)
          .where(eq(s.roleAssignments.id, roleAssignmentId)));
        expect(restored.metadata?.revokedAt).toBeNull();
        expect(restored.metadata?.revocationReason).toBeNull();
        expect(restored.metadata?.revokedByPersonId).toBeNull();
        expect([...restored.capabilities].sort())
          .toEqual([...siteWebsitePublisherCapabilities].sort());
        expect(await tx.select({ id: s.roleAssignments.id }).from(s.roleAssignments)
          .where(and(eq(s.roleAssignments.id, roleAssignmentId), activeRoleAssignmentPredicate())))
          .toHaveLength(1);
        const allAssignments = await tx.select({ id: s.roleAssignments.id })
          .from(s.roleAssignments).where(and(
            eq(s.roleAssignments.personId, invitedPersonId),
            eq(s.roleAssignments.roleKey, "site_website_editor"),
          ));
        expect(allAssignments).toEqual([{ id: roleAssignmentId }]);

        // The invite path's normal event records the restored relationship.
        const events = await tx.select({ payload: s.domainEvents.payload })
          .from(s.domainEvents).where(and(
            eq(s.domainEvents.eventType, "StaffInvitationIssued"),
            eq(s.domainEvents.aggregateId, reinvited.grantId),
          ));
        expect(events).toHaveLength(1);
        expect(events[0]!.payload).toMatchObject({
          role: "site_website_editor",
          publisherRelationship: { membershipCreated: false, assignmentCreated: true },
        });

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
