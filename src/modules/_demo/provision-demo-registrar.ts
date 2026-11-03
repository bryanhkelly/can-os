import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, memberships, organizations, people,
  programs, roleAssignments, sites,
} from "@/db/schema";
import { isLocalDemoProvisioningEnabled, LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { listDemoSourceGrants } from "@/modules/identity/session-grants.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
export const demoRegistrar = {
  personId: "f7000000-0000-4000-8000-000000000001",
  accountId: "f7000000-0000-4000-8000-000000000002",
  grantId: "f7000000-0000-4000-8000-000000000003",
  roleAssignmentId: "f7000000-0000-4000-8000-000000000005",
  organizationId: "f1000000-0000-4000-8000-000000000002",
  siteId: "f1000000-0000-4000-8000-000000000003",
  email: "alex.registrar@valorschool.demo",
} as const;

export const demoRegistrarInstitutionalCapabilities = [
  "profiles.credentials.verify",
  "profiles.catalog.create",
  "staffing.policy.publish",
  "curriculum.publish",
  "program.opening.handoff.manage",
] as const;

type DemoEnvironment = {
  NODE_ENV?: string;
  CAN_DEMO_FIXED_ACCESS_ENABLED?: string;
};

/** Explicit operator bootstrap, never called by login or an application request. */
export async function provisionDemoRegistrar(database: Pick<Database, "transaction">, env: DemoEnvironment) {
  return provisionScopedRegistrar(database, env, demoRegistrar);
}

export async function provisionDemoSiteAdmin(database: Pick<Database, "transaction">, env: DemoEnvironment) {
  return provisionScopedRegistrar(database, env, LOCAL_DEMO_ADMIN);
}

async function provisionScopedRegistrar(
  database: Pick<Database, "transaction">, env: DemoEnvironment,
  fixture: { personId: string; accountId: string; grantId: string; roleAssignmentId: string;
    organizationId: string; siteId: string; email: string },
) {
  if (!isLocalDemoProvisioningEnabled(env)) {
    throw new Error("Registrar provisioning requires local/test mode and CAN_DEMO_FIXED_ACCESS_ENABLED=true");
  }
  const isAdmin = fixture.accountId === LOCAL_DEMO_ADMIN.accountId;
  const expectedRole = isAdmin ? "site_admin" : "registrar";
  const requiredCapabilities = isAdmin
    ? [...demoRegistrarInstitutionalCapabilities, "site.publication.manage"]
    : [...demoRegistrarInstitutionalCapabilities];
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('can-os:demo-registrar'))`);
    const [organization] = await tx.select().from(organizations)
      .where(eq(organizations.id, fixture.organizationId)).for("update");
    const [site] = await tx.select().from(sites).where(eq(sites.id, fixture.siteId)).for("update");
    const sitePrograms = await tx.select().from(programs).where(eq(programs.siteId, fixture.siteId));
    if (organization?.metadata.synthetic !== true || site?.metadata.synthetic !== true ||
      site.organizationId !== fixture.organizationId ||
      sitePrograms.some(program => program.organizationId !== fixture.organizationId)) {
      throw new Error("Registrar provisioning requires the existing isolated synthetic demo school and site");
    }

    const changes: string[] = [];
    const personRows = await tx.insert(people).values({
      id: fixture.personId, legalFirstName: isAdmin ? "Demo" : "Alex",
      legalLastName: isAdmin ? "Admin" : "Example", preferredName: isAdmin ? "Demo" : "Alex",
      metadata: { synthetic: true, role: expectedRole },
    }).onConflictDoNothing().returning({ id: people.id });
    if (personRows.length) changes.push("person");
    const [person] = await tx.select().from(people).where(eq(people.id, fixture.personId)).for("update");
    if (!person?.active || person.metadata.synthetic !== true) {
      throw new Error("Demo registrar person is inactive or is not synthetic");
    }
    if (isAdmin && person.legalFirstName === "Demo" && person.legalLastName === "Admin" &&
      person.preferredName === "Demo Admin") {
      await tx.update(people).set({ preferredName: "Demo", updatedAt: new Date() })
        .where(eq(people.id, fixture.personId));
      changes.push("person_display_name");
    }
    const accountRows = await tx.insert(accessAccounts).values({
      id: fixture.accountId, emailNormalized: fixture.email,
    }).onConflictDoNothing().returning({ id: accessAccounts.id });
    if (accountRows.length) changes.push("account");
    const [account] = await tx.select().from(accessAccounts)
      .where(eq(accessAccounts.id, fixture.accountId)).for("update");
    if (account?.emailNormalized === fixture.email.replace("@valorschool.demo", "@can-os.invalid")) {
      await tx.update(accessAccounts).set({ emailNormalized: fixture.email, updatedAt: new Date() })
        .where(eq(accessAccounts.id, fixture.accountId));
      changes.push("account_email");
    }
    const [currentAccount] = await tx.select().from(accessAccounts)
      .where(eq(accessAccounts.id, fixture.accountId)).for("update");
    if (!currentAccount || currentAccount.emailNormalized !== fixture.email || currentAccount.disabled) {
      throw new Error("Demo registrar account conflicts with an existing or disabled account");
    }
    const grantRows = await tx.insert(accountPersonGrants).values({
      id: fixture.grantId, accountId: fixture.accountId, personId: fixture.personId,
      role: expectedRole, organizationId: fixture.organizationId, siteId: fixture.siteId,
    }).onConflictDoNothing().returning({ id: accountPersonGrants.id });
    if (grantRows.length) changes.push("access_grant");
    const accountGrants = await tx.select().from(accountPersonGrants)
      .where(eq(accountPersonGrants.accountId, fixture.accountId)).for("update");
    const canonicalGrant = accountGrants.find(grant => grant.id === fixture.grantId);
    if (isAdmin && canonicalGrant?.active && canonicalGrant.role === "registrar" &&
      canonicalGrant.accountId === fixture.accountId && canonicalGrant.personId === fixture.personId &&
      canonicalGrant.organizationId === fixture.organizationId && canonicalGrant.siteId === fixture.siteId) {
      await tx.update(accountPersonGrants).set({ role: expectedRole, updatedAt: new Date() })
        .where(eq(accountPersonGrants.id, canonicalGrant.id));
      canonicalGrant.role = expectedRole;
      changes.push("site_admin_role");
    }
    if ((!isAdmin && accountGrants.filter(grant => grant.active).length !== 1) || !accountGrants.some(grant =>
      grant.id === fixture.grantId && grant.active &&
      grant.role === expectedRole && grant.personId === fixture.personId &&
      grant.organizationId === fixture.organizationId && grant.siteId === fixture.siteId)) {
      throw new Error("Demo registrar access grants conflict; no existing authority will be replaced");
    }

    const membershipRows = await tx.insert(memberships).values({
      personId: fixture.personId, organizationId: fixture.organizationId,
      title: isAdmin ? "Demo school Site Admin" : "Demo school registrar",
      metadata: { synthetic: true, source: "demo-registrar-bootstrap" },
    }).onConflictDoNothing().returning({ id: memberships.id });
    if (membershipRows.length) changes.push("membership");
    const [membership] = await tx.select().from(memberships).where(and(
      eq(memberships.personId, fixture.personId), eq(memberships.organizationId, fixture.organizationId),
    ));
    if (membership?.metadata.synthetic !== true) throw new Error("Existing membership is not synthetic");

    const roleRows = await tx.insert(roleAssignments).values({
      id: fixture.roleAssignmentId, personId: fixture.personId, roleKey: expectedRole,
      organizationId: fixture.organizationId, siteId: fixture.siteId,
      capabilities: requiredCapabilities,
      metadata: { synthetic: true, source: "demo-registrar-bootstrap" },
    }).onConflictDoNothing().returning({ id: roleAssignments.id });
    if (roleRows.length) changes.push("institutional_grant");
    const [role] = await tx.select().from(roleAssignments)
      .where(eq(roleAssignments.id, fixture.roleAssignmentId)).for("update");
    if (!role || role.personId !== fixture.personId || role.organizationId !== fixture.organizationId ||
      role.siteId !== fixture.siteId || role.programId !== null ||
      (role.roleKey !== expectedRole && !(isAdmin && role.roleKey === "registrar")) ||
      role.metadata.synthetic !== true || role.metadata.revokedAt != null) {
      throw new Error("Existing institutional grant conflicts with the demo school scope");
    }
    const capabilities = [...new Set([...role.capabilities, ...requiredCapabilities])];
    if (role.roleKey !== expectedRole ||
      requiredCapabilities.some(capability => !role.capabilities.includes(capability))) {
      await tx.update(roleAssignments).set({
        capabilities, roleKey: expectedRole,
        updatedAt: new Date(),
      }).where(eq(roleAssignments.id, role.id));
      changes.push("institutional_capabilities");
    }

    if (changes.length) {
      const scope = { organizationId: fixture.organizationId, siteId: fixture.siteId };
      await writeAudit(tx, {
        actorPersonId: null, action: "demo.registrar.provision", resourceType: "person",
        resourceId: fixture.personId, scope,
        after: { changes, role: expectedRole, roleAssignmentId: role.id, capabilities },
        context: { method: "operator_bootstrap", synthetic: true },
      });
      await emitEvent(tx, {
        eventType: EventTypes.DemoRegistrarProvisioned, aggregateType: "person", aggregateId: fixture.personId,
        ...scope, payload: { changes, roleAssignmentId: role.id, synthetic: true },
      });
    }
    return { email: fixture.email, organizationId: fixture.organizationId, siteId: fixture.siteId, changes };
  });
}

export async function provisionDemoSchoolAccess(database: Pick<Database, "transaction">, env: DemoEnvironment) {
  return database.transaction(async tx => {
    const registrar = await provisionDemoRegistrar(tx, env);
    const admin = await provisionDemoSiteAdmin(tx, env);
    const changedAccounts: string[] = [];
    const sourceFixtures = [
      { suffix: "1", email: "jordan.student@valorschool.demo", role: "student", personId: "f1000000-0000-4000-8000-000000000005" },
      { suffix: "2", email: "riley.teacher@valorschool.demo", role: "teacher", personId: "f1000000-0000-4000-8000-000000000006" },
      { suffix: "3", email: "casey.specialist@valorschool.demo", role: "specialist", personId: "f4100000-0000-4000-8000-000000000003" },
      { suffix: "4", email: "morgan.guardian@valorschool.demo", role: "guardian", personId: "f3000000-0000-4000-8000-000000000007" },
    ];
    for (const fixture of sourceFixtures) {
      const accountId = `fa000000-0000-4000-8000-${fixture.suffix.padStart(12, "0")}`;
      const [account] = await tx.select().from(accessAccounts)
        .where(eq(accessAccounts.id, accountId)).for("update");
      if (!account) continue;
      if (account.disabled || ![fixture.email, fixture.email.replace("@valorschool.demo", "@can-os.invalid")].includes(account.emailNormalized)) {
        throw new Error("Legacy demo source account conflicts with the approved identity");
      }
      const [person] = await tx.select().from(people)
        .where(eq(people.id, fixture.personId)).for("update");
      const grants = await tx.select().from(accountPersonGrants)
        .where(eq(accountPersonGrants.accountId, accountId)).for("update");
      if (!person?.active || person.metadata.synthetic !== true || !grants.some(grant =>
        grant.id === `fb000000-0000-4000-8000-${fixture.suffix.padStart(12, "0")}` &&
        grant.active && grant.personId === fixture.personId && grant.role === fixture.role &&
        grant.organizationId === LOCAL_DEMO_ADMIN.organizationId && grant.siteId === LOCAL_DEMO_ADMIN.siteId)) {
        throw new Error("Legacy demo source membership is inactive or conflicts with the approved tenant");
      }
      if (account.emailNormalized === fixture.email) continue;
      const conflicts = await tx.select({ id: accessAccounts.id }).from(accessAccounts)
        .where(eq(accessAccounts.emailNormalized, fixture.email));
      if (conflicts.length) throw new Error("Demo source address belongs to another account");
      await tx.update(accessAccounts).set({ emailNormalized: fixture.email, updatedAt: new Date() })
        .where(eq(accessAccounts.id, accountId));
      changedAccounts.push(accountId);
    }
    const sources = await listDemoSourceGrants(tx);
    const expectedEmails = LOCAL_DEMO_ACCOUNTS.filter(account => account.email !== LOCAL_DEMO_ADMIN.email);
    if (sources.length !== expectedEmails.length || expectedEmails.some(account =>
      !sources.some(source => source.email === account.email))) {
      throw new Error("Every approved demo user must have exactly one active school grant before enabling the admin");
    }
    const changedGrants: string[] = [];
    const legacyGrants = [
      {
        id: LOCAL_DEMO_ADMIN.facilitatorGrantId,
        personId: LOCAL_DEMO_ADMIN.personId,
        role: "demo_facilitator",
      },
      ...expectedEmails.map((account, index) => {
        const source = sources.find(grant => grant.email === account.email);
        if (!source) throw new Error("Demo source membership is unavailable");
        return {
          id: `f7100000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
          personId: source.personId,
          role: source.role,
        };
      }),
    ];
    for (const expected of legacyGrants) {
      const [legacy] = await tx.select().from(accountPersonGrants)
        .where(eq(accountPersonGrants.id, expected.id)).for("update");
      if (!legacy) continue;
      if (legacy.accountId !== LOCAL_DEMO_ADMIN.accountId || legacy.personId !== expected.personId ||
        legacy.role !== expected.role ||
        legacy.organizationId !== LOCAL_DEMO_ADMIN.organizationId ||
        legacy.siteId !== LOCAL_DEMO_ADMIN.siteId) {
        throw new Error("Legacy demo account grant conflicts with the expected tenant scope");
      }
      if (legacy.active) {
        await tx.update(accountPersonGrants).set({ active: false, updatedAt: new Date() })
          .where(eq(accountPersonGrants.id, legacy.id));
        changedGrants.push(legacy.id);
      }
    }
    if (changedGrants.length || changedAccounts.length) {
      const scope = { organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId };
      await writeAudit(tx, {
        actorPersonId: null, action: "demo.account.switching.provision", resourceType: "account",
        resourceId: LOCAL_DEMO_ADMIN.accountId, scope, after: { grantIds: changedGrants, accountIds: changedAccounts },
        context: { method: "operator_bootstrap", retiredLegacyGrantIds: changedGrants, normalizedAccountIds: changedAccounts },
      });
      await emitEvent(tx, {
        eventType: EventTypes.DemoFacilitatorProvisioned, aggregateType: "account",
        aggregateId: LOCAL_DEMO_ADMIN.accountId, ...scope,
        payload: { retiredLegacyGrantIds: changedGrants, normalizedAccountIds: changedAccounts },
      });
    }
    return { registrar, admin, changedGrants, changedAccounts };
  });
}
