import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, memberships, organizations, people, roleAssignments, schoolSetupSignups, sites } from "@/db/schema";
import { DEFAULT_SITE_TIMEZONE } from "@/domain/site-timezone";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Signup = typeof schoolSetupSignups.$inferSelect;

function uniqueSlug(name: string, signupId: string): string {
  const stem = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38).replace(/-+$/g, "") || "school";
  return `${stem}-${signupId.replace(/-/g, "").slice(0, 8)}`;
}

/** Provision the first real Site Admin only while redeeming the email challenge. */
export async function provisionVerifiedSchoolSignup(tx: Tx, signup: Signup, accountId: string, email: string, now: Date) {
  if (signup.consumedAt || signup.expiresAt <= now || signup.organizationId || signup.siteId)
    throw new Error("School setup signup is no longer available");

  const slug = uniqueSlug(signup.schoolName, signup.id);
  const [organization] = await tx.insert(organizations).values({
    type: "christian_school", name: signup.schoolName, slug,
  }).returning({ id: organizations.id });
  if (!organization) throw new Error("School organization could not be created");

  const [site] = await tx.insert(sites).values({
    organizationId: organization.id, name: signup.schoolName, slug,
    timezone: DEFAULT_SITE_TIMEZONE,
    metadata: { siteIdentityRevision: now.toISOString() },
    updatedAt: now,
  }).returning({ id: sites.id });
  if (!site) throw new Error("School Site could not be created");

  const associated=await tx.select({
    personId: accountPersonGrants.personId,
    role: accountPersonGrants.role,
  }).from(accountPersonGrants).where(and(
    eq(accountPersonGrants.accountId, accountId),
    eq(accountPersonGrants.active, true),
  ));
  if (associated.some(grant=>grant.role!=="account_holder") ||
      new Set(associated.map(grant=>grant.personId)).size>1)
    throw new Error("School founder identity needs verification before reuse");
  const existingPersonId=associated[0]?.personId;
  const [createdPerson] = existingPersonId ? [null] : await tx.insert(people).values({
    legalFirstName: signup.firstName, legalLastName: signup.lastName, email,
  }).returning({ id: people.id });
  const personId=existingPersonId??createdPerson?.id;
  if (!personId) throw new Error("School administrator identity could not be created");

  const [grant] = await tx.insert(accountPersonGrants).values({
    accountId, personId, role: "site_admin",
    organizationId: organization.id, siteId: site.id, active: true,
  }).returning({ id: accountPersonGrants.id });
  if (!grant) throw new Error("Initial Site Admin grant could not be created");

  await tx.insert(memberships).values({
    personId, organizationId: organization.id, title: "Site Administrator",
  });
  await tx.insert(roleAssignments).values({
    personId, organizationId: organization.id, siteId: site.id,
    roleKey: "site_admin", capabilities: ["profiles.credentials.verify", "profiles.catalog.create",
      "staffing.policy.publish", "curriculum.publish", "program.opening.handoff.manage",
      "site.publication.manage"],
  });

  await writeAudit(tx, {
    actorPersonId: personId, action: "school.setup", resourceType: "organization",
    resourceId: organization.id, scope: { organizationId: organization.id, siteId: site.id },
    after: { schoolName: signup.schoolName, initialGrantId: grant.id,
      source: "verified_email_school_setup" },
    context: { accountId, grantId: grant.id, role: "site_admin", authenticated: true,
      source: "verified_email_school_setup" },
  });
  await emitEvent(tx, {
    eventType: EventTypes.SchoolSetupCompleted, aggregateType: "organization",
    aggregateId: organization.id, actorPersonId: personId,
    organizationId: organization.id, siteId: site.id,
    payload: { source: "verified_email_school_setup" },
  });
  await emitEvent(tx, {
    eventType: EventTypes.SiteCreated, aggregateType: "site", aggregateId: site.id,
    actorPersonId: personId, organizationId: organization.id, siteId: site.id,
    payload: { name: signup.schoolName, timezone: DEFAULT_SITE_TIMEZONE },
  });

  const [completed] = await tx.update(schoolSetupSignups).set({
    consumedAt: now, organizationId: organization.id, siteId: site.id, updatedAt: now,
  }).where(and(eq(schoolSetupSignups.id, signup.id), isNull(schoolSetupSignups.consumedAt)))
    .returning({ id: schoolSetupSignups.id });
  if (!completed) throw new Error("School setup signup was already consumed");
  return { organizationId: organization.id, siteId: site.id, grantId: grant.id };
}