import { eq, sql } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, demoSchoolTenants, memberships,
  organizations, people, roleAssignments, sites,
} from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { matchesDemoSchoolAdministrator, schoolSetupSchema, type SchoolSetupInput, type SchoolSetupResult } from "@/domain/school-setup";
import { emitEvent, writeAudit } from "@/platform/mutation";

/** Public bootstrap creates only a new synthetic institution; never adopts existing records. */
export async function setupSchool(
  input: SchoolSetupInput,
  database: Pick<Database, "transaction"> = db,
): Promise<SchoolSetupResult> {
  const data = schoolSetupSchema.parse(input);
  const slug = `demo-${data.domain.slice(0, -5)}`;
  const adminEmail = `admin.demo@${data.domain}`;
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"school-setup:" + data.domain}))`);
    const [existing] = await tx.select().from(demoSchoolTenants)
      .where(eq(demoSchoolTenants.domain, data.domain)).limit(1);
    if (existing) {
      const [organization] = await tx.select().from(organizations)
        .where(eq(organizations.id, existing.organizationId)).limit(1);
      const [site] = await tx.select().from(sites).where(eq(sites.id, existing.siteId)).limit(1);
      const [account] = await tx.select().from(accessAccounts)
        .where(eq(accessAccounts.id, existing.adminAccountId)).limit(1);
      const [person] = await tx.select().from(people)
        .where(eq(people.id, existing.adminPersonId)).limit(1);
      const [grant] = await tx.select().from(accountPersonGrants)
        .where(eq(accountPersonGrants.id, existing.adminGrantId)).limit(1);
      if (!organization || organization.name !== data.name || !site ||
        site.organizationId !== organization.id || site.timezone !== data.timezone ||
        !account || account.disabled || !person?.active || !grant?.active ||
        !matchesDemoSchoolAdministrator(existing, grant, account.emailNormalized)) {
        throw new DomainError("CONFLICT", "The demo domain has a different or unavailable setup");
      }
      return { organizationId: existing.organizationId, siteId: existing.siteId,
        domain: existing.domain, adminEmail, created: false };
    }

    const [occupied] = await tx.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, slug)).limit(1);
    const [occupiedEmail] = await tx.select({ id: accessAccounts.id }).from(accessAccounts)
      .where(eq(accessAccounts.emailNormalized, adminEmail)).limit(1);
    if (occupied || occupiedEmail) throw new DomainError("CONFLICT", "School identity already exists");

    const [organization] = await tx.insert(organizations).values({
      name: data.name, slug, type: "christian_school",
      metadata: { synthetic: true, demoDomain: data.domain },
    }).returning();
    if (!organization) throw new Error("School organization was not created");
    const [site] = await tx.insert(sites).values({
      organizationId: organization.id, name: data.name, slug,
      timezone: data.timezone, metadata: { synthetic: true },
    }).returning();
    const [person] = await tx.insert(people).values({
      legalFirstName: "Demo", legalLastName: "Administrator",
      metadata: { synthetic: true },
    }).returning();
    const [account] = await tx.insert(accessAccounts).values({ emailNormalized: adminEmail }).returning();
    if (!site || !person || !account) throw new Error("School bootstrap identity was not created");
    const [grant] = await tx.insert(accountPersonGrants).values({
      accountId: account.id, personId: person.id, role: "site_admin",
      organizationId: organization.id, siteId: site.id,
    }).returning();
    if (!grant) throw new Error("School administrator grant was not created");
    await tx.insert(memberships).values({
      personId: person.id, organizationId: organization.id, title: "Demo school administrator",
    });
    await tx.insert(roleAssignments).values({
      personId: person.id, organizationId: organization.id, siteId: site.id, roleKey: "site_admin",
      capabilities: ["profiles.credentials.verify", "profiles.catalog.create", "staffing.policy.publish",
        "curriculum.publish", "program.opening.handoff.manage", "site.publication.manage"],
    });
    await tx.insert(demoSchoolTenants).values({
      domain: data.domain, organizationId: organization.id, siteId: site.id,
      adminAccountId: account.id, adminPersonId: person.id, adminGrantId: grant.id,
    });
    const scope = { organizationId: organization.id, siteId: site.id };
    await writeAudit(tx, {
      actorPersonId: null, action: "school.setup", resourceType: "organization", resourceId: organization.id,
      scope, after: { domain: data.domain, classification: "demo", administratorGrantId: grant.id },
      context: { source: "public_school_setup", authenticated: false },
    });
    await emitEvent(tx, {
      eventType: EventTypes.SchoolSetupCompleted, aggregateType: "organization", aggregateId: organization.id,
      ...scope, payload: { domain: data.domain, classification: "demo" },
    });
    await emitEvent(tx, {
      eventType: EventTypes.SiteCreated, aggregateType: "site", aggregateId: site.id,
      ...scope, payload: { name: data.name, timezone: data.timezone },
    });
    return { ...scope, domain: data.domain, adminEmail, created: true };
  });
}
