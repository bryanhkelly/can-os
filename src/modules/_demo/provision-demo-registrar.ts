import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, memberships, organizations, people,
  programs, roleAssignments, sites,
} from "@/db/schema";
import { isLocalDemoProvisioningEnabled, LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { emitEvent, writeAudit } from "@/platform/mutation";

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

async function provisionScopedRegistrar(
  database: Pick<Database, "transaction">, env: DemoEnvironment,
  fixture: { personId: string; accountId: string; grantId: string; roleAssignmentId: string;
    organizationId: string; siteId: string; email: string },
) {
  if (!isLocalDemoProvisioningEnabled(env)) {
    throw new Error("Registrar provisioning requires local/test mode and CAN_DEMO_FIXED_ACCESS_ENABLED=true");
  }
  const isAdmin = fixture.accountId === LOCAL_DEMO_ADMIN.accountId;
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('can-os:demo-registrar'))`);
    const [organization] = await tx.select().from(organizations)
      .where(eq(organizations.id, fixture.organizationId)).for("update");
    const [site] = await tx.select().from(sites).where(eq(sites.id, fixture.siteId)).for("update");
    const sitePrograms = await tx.select().from(programs).where(eq(programs.siteId, fixture.siteId));
    if (!organization || !site || site.organizationId !== fixture.organizationId ||
      sitePrograms.some(program => program.organizationId !== fixture.organizationId)) {
      throw new Error("Registrar provisioning requires the existing demo school and its site");
    }

    const changes: string[] = [];
    const personRows = await tx.insert(people).values({
      id: fixture.personId, legalFirstName: isAdmin ? "Demo" : "Alex",
      legalLastName: isAdmin ? "Admin" : "Example", preferredName: isAdmin ? "Demo" : "Alex",
      metadata: { role: "registrar" },
    }).onConflictDoNothing().returning({ id: people.id });
    if (personRows.length) changes.push("person");
    const [person] = await tx.select().from(people).where(eq(people.id, fixture.personId)).for("update");
    if (!person?.active) {
      throw new Error("Demo registrar person is inactive");
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
      role: "registrar", organizationId: fixture.organizationId, siteId: fixture.siteId,
    }).onConflictDoNothing().returning({ id: accountPersonGrants.id });
    if (grantRows.length) changes.push("access_grant");
    const accountGrants = await tx.select().from(accountPersonGrants)
      .where(eq(accountPersonGrants.accountId, fixture.accountId)).for("update");
    if (accountGrants.filter(grant => grant.active).length !== 1 || !accountGrants.some(grant =>
      grant.id === fixture.grantId && grant.active &&
      grant.role === "registrar" && grant.personId === fixture.personId &&
      grant.organizationId === fixture.organizationId && grant.siteId === fixture.siteId)) {
      throw new Error("Demo registrar access grants conflict; no existing authority will be replaced");
    }

    const membershipRows = await tx.insert(memberships).values({
      personId: fixture.personId, organizationId: fixture.organizationId,
      title: "Demo school registrar", metadata: { source: "demo-registrar-bootstrap" },
    }).onConflictDoNothing().returning({ id: memberships.id });
    if (membershipRows.length) changes.push("membership");
    const [membership] = await tx.select().from(memberships).where(and(
      eq(memberships.personId, fixture.personId), eq(memberships.organizationId, fixture.organizationId),
    ));
    if (!membership) throw new Error("Demo registrar membership was not created");

    const roleRows = await tx.insert(roleAssignments).values({
      id: fixture.roleAssignmentId, personId: fixture.personId, roleKey: "registrar",
      organizationId: fixture.organizationId, siteId: fixture.siteId,
      capabilities: [...demoRegistrarInstitutionalCapabilities],
      metadata: { source: "demo-registrar-bootstrap" },
    }).onConflictDoNothing().returning({ id: roleAssignments.id });
    if (roleRows.length) changes.push("institutional_grant");
    const [role] = await tx.select().from(roleAssignments)
      .where(eq(roleAssignments.id, fixture.roleAssignmentId)).for("update");
    if (!role || role.personId !== fixture.personId || role.organizationId !== fixture.organizationId ||
      role.siteId !== fixture.siteId || role.programId !== null || role.roleKey !== "registrar") {
      throw new Error("Existing institutional grant conflicts with the demo school scope");
    }
    const capabilities = [...new Set([...role.capabilities, ...demoRegistrarInstitutionalCapabilities])];
    if (demoRegistrarInstitutionalCapabilities.some(capability => !role.capabilities.includes(capability))) {
      await tx.update(roleAssignments).set({
        capabilities,
        updatedAt: new Date(),
      }).where(eq(roleAssignments.id, role.id));
      changes.push("institutional_capabilities");
    }

    if (changes.length) {
      const scope = { organizationId: fixture.organizationId, siteId: fixture.siteId };
      await writeAudit(tx, {
        actorPersonId: null, action: "demo.registrar.provision", resourceType: "person",
        resourceId: fixture.personId, scope,
        after: { changes, roleAssignmentId: role.id, capabilities },
        context: { method: "operator_bootstrap" },
      });
      await emitEvent(tx, {
        eventType: "DemoRegistrarProvisioned", aggregateType: "person", aggregateId: fixture.personId,
        ...scope, payload: { changes, roleAssignmentId: role.id },
      });
    }
    return { email: fixture.email, organizationId: fixture.organizationId, siteId: fixture.siteId, changes };
  });
}

export async function provisionDemoSchoolAccess(database: Pick<Database, "transaction">, env: DemoEnvironment) {
  if (!isLocalDemoProvisioningEnabled(env)) {
    throw new Error("Registrar provisioning requires local/test mode and CAN_DEMO_FIXED_ACCESS_ENABLED=true");
  }
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('can-os:demo-registrar'))`);
    const changedAccountEmails: string[] = [];
    const legacyPersonas = [
      { accountId: "fa000000-0000-4000-8000-000000000001", personId: "f1000000-0000-4000-8000-000000000005", role: "student", email: "jordan.student@valorschool.demo" },
      { accountId: "fa000000-0000-4000-8000-000000000002", personId: "f1000000-0000-4000-8000-000000000006", role: "teacher", email: "riley.teacher@valorschool.demo" },
      { accountId: "fa000000-0000-4000-8000-000000000003", personId: "f4100000-0000-4000-8000-000000000003", role: "specialist", email: "casey.specialist@valorschool.demo" },
      { accountId: "fa000000-0000-4000-8000-000000000004", personId: "f3000000-0000-4000-8000-000000000007", role: "guardian", email: "morgan.guardian@valorschool.demo" },
    ] as const;
    for (const persona of legacyPersonas) {
      const [account] = await tx.select().from(accessAccounts)
        .where(eq(accessAccounts.id, persona.accountId)).for("update");
      if (!account || account.emailNormalized === persona.email) continue;
      if (account.disabled || account.emailNormalized !== persona.email.replace("@valorschool.demo", "@can-os.invalid")) {
        throw new Error("Legacy demo account conflicts with the expected identity");
      }
      const grants = await tx.select().from(accountPersonGrants)
        .where(eq(accountPersonGrants.accountId, account.id)).for("update");
      if (!grants.some(grant => grant.active && grant.personId === persona.personId && grant.role === persona.role) ||
        grants.some(grant => grant.personId !== persona.personId ||
          grant.organizationId !== LOCAL_DEMO_ADMIN.organizationId || grant.siteId !== LOCAL_DEMO_ADMIN.siteId)) {
        throw new Error("Legacy demo account conflicts with the expected tenant membership");
      }
      await tx.update(accessAccounts).set({ emailNormalized: persona.email, updatedAt: new Date() })
        .where(eq(accessAccounts.id, account.id));
      await writeAudit(tx, {
        actorPersonId: null, action: "demo.account.email_migrated", resourceType: "account",
        resourceId: account.id,
        scope: { organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId },
        before: { email: account.emailNormalized }, after: { email: persona.email },
        context: { method: "operator_bootstrap" },
      });
      await emitEvent(tx, {
        eventType: "DemoAccountEmailMigrated", aggregateType: "account", aggregateId: account.id,
        organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
        payload: { email: persona.email },
      });
      changedAccountEmails.push(account.id);
    }
    const registrar = await provisionDemoRegistrar(tx, env);
    const expectedEmails = LOCAL_DEMO_ACCOUNTS.filter(account => account.email !== LOCAL_DEMO_ADMIN.email);
    const changedGrants: string[] = [];
    const caseyEmail = "casey.specialist@valorschool.demo";
    const [casey] = await tx.select({
      accountId: accessAccounts.id, personId: accountPersonGrants.personId,
    }).from(accessAccounts)
      .innerJoin(accountPersonGrants, eq(accountPersonGrants.accountId, accessAccounts.id))
      .where(and(
        eq(accessAccounts.emailNormalized, caseyEmail),
        eq(accessAccounts.disabled, false),
        eq(accountPersonGrants.role, "specialist"),
        eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
        eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
        eq(accountPersonGrants.active, true),
      ));
    const [legacyCounselor] = await tx.select().from(accountPersonGrants)
      .where(eq(accountPersonGrants.id, "fb000000-0000-4000-8000-000000000005")).for("update");
    if (legacyCounselor) {
      if (!casey || legacyCounselor.accountId !== casey.accountId ||
        legacyCounselor.personId !== casey.personId || legacyCounselor.role !== "counselor" ||
        legacyCounselor.organizationId !== LOCAL_DEMO_ADMIN.organizationId ||
        legacyCounselor.siteId !== LOCAL_DEMO_ADMIN.siteId) {
        throw new Error("Legacy Casey role conflicts with the expected demo tenant membership");
      }
      if (legacyCounselor.active) {
        await tx.update(accountPersonGrants).set({ active: false, updatedAt: new Date() })
          .where(eq(accountPersonGrants.id, legacyCounselor.id));
        changedGrants.push(legacyCounselor.id);
      }
    }
    const sources = await tx.select({
      id: accountPersonGrants.id,
      accountId: accountPersonGrants.accountId,
      personId: people.id,
      email: accessAccounts.emailNormalized,
      role: accountPersonGrants.role,
      organizationId: accountPersonGrants.organizationId,
      siteId: accountPersonGrants.siteId,
    }).from(accountPersonGrants)
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .where(and(
        inArray(accessAccounts.emailNormalized, expectedEmails.map(account => account.email)),
        eq(accessAccounts.disabled, false), eq(people.active, true),
        eq(accountPersonGrants.active, true),
        eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
        eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
      ));
    if (sources.length !== expectedEmails.length || expectedEmails.some(account =>
      sources.filter(source => source.email === account.email && source.role === account.role.toLowerCase()).length !== 1)) {
      throw new Error("Every demo user must have exactly one active membership in the demo school");
    }
    for (const [index, account] of expectedEmails.entries()) {
      const id = `f7100000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;
      const [legacy] = await tx.select().from(accountPersonGrants).where(eq(accountPersonGrants.id, id)).for("update");
      if (!legacy) continue;
      const source = sources.find(grant => grant.email === account.email)!;
      if (legacy.accountId !== LOCAL_DEMO_ADMIN.accountId || legacy.personId !== source.personId ||
        legacy.role !== source.role ||
        legacy.organizationId !== LOCAL_DEMO_ADMIN.organizationId || legacy.siteId !== LOCAL_DEMO_ADMIN.siteId) {
        throw new Error("Legacy demo membership conflicts with the demo tenant");
      }
      if (legacy.active) {
        await tx.update(accountPersonGrants).set({ active: false, updatedAt: new Date() })
          .where(eq(accountPersonGrants.id, legacy.id));
        changedGrants.push(legacy.id);
      }
    }
    const [legacyFacilitator] = await tx.select().from(accountPersonGrants)
      .where(eq(accountPersonGrants.id, LOCAL_DEMO_ADMIN.facilitatorGrantId)).for("update");
    if (legacyFacilitator) {
      if (legacyFacilitator.accountId !== LOCAL_DEMO_ADMIN.accountId ||
        legacyFacilitator.personId !== LOCAL_DEMO_ADMIN.personId ||
        legacyFacilitator.role !== "demo_facilitator" ||
        legacyFacilitator.organizationId !== LOCAL_DEMO_ADMIN.organizationId ||
        legacyFacilitator.siteId !== LOCAL_DEMO_ADMIN.siteId) {
        throw new Error("Legacy facilitator grant conflicts with the demo tenant");
      }
      if (legacyFacilitator.active) {
        await tx.update(accountPersonGrants).set({ active: false, updatedAt: new Date() })
          .where(eq(accountPersonGrants.id, legacyFacilitator.id));
        changedGrants.push(legacyFacilitator.id);
      }
    }
    const admin = await provisionScopedRegistrar(tx, env, LOCAL_DEMO_ADMIN);
    if (changedGrants.length) {
      const scope = { organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId };
      await writeAudit(tx, {
        actorPersonId: null, action: "demo.legacy_memberships.retire", resourceType: "account",
        resourceId: LOCAL_DEMO_ADMIN.accountId, scope, after: { grantIds: changedGrants },
        context: { method: "operator_bootstrap" },
      });
      await emitEvent(tx, {
        eventType: "DemoLegacyMembershipsRetired", aggregateType: "account",
        aggregateId: LOCAL_DEMO_ADMIN.accountId, ...scope,
        payload: { grantIds: changedGrants },
      });
    }
    return { registrar, admin, changedGrants, changedAccountEmails };
  });
}
