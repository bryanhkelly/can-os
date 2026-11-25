import { hashPrivateAccessCode, issueOpaqueSecret } from "@/domain/access-tokens";
import { identityEmailDomain } from "@/domain/domain-classification";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, demoSchoolTenants, memberships, organizations, people, roleAssignments, schoolSetupSignups, sites } from "@/db/schema";
import { isDemoAccountEmail, DEMO_ACCOUNT_DOMAIN } from "@/domain/local-demo-access";
import { isDemoSchoolDomain, siteSignupSchema } from "@/domain/school-setup";
import { DomainError } from "@/domain/errors";
import { DEFAULT_SITE_TIMEZONE } from "@/domain/site-timezone";
import { initialVerifiedSignupOrganizationType, publicSignupOrganizationTypeSchema } from "@/domain/school-setup";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Signup = typeof schoolSetupSignups.$inferSelect;

function uniqueSlug(name: string, signupId: string): string {
  const stem = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38).replace(/-+$/g, "") || "site";
  return `${stem}-${signupId.replace(/-/g, "").slice(0, 8)}`;
}

/** Provision the first real Site Admin only while redeeming the email challenge. */
export async function provisionVerifiedSchoolSignup(tx: Tx, signup: Signup, accountId: string, email: string, now: Date, approval: "verified_email" | "demo_code" = "verified_email") {
  if ((approval === "demo_code") !== isDemoAccountEmail(email)) throw new DomainError("FORBIDDEN");
  const source = approval === "demo_code" ? "demo_account_school_setup" : "verified_email_school_setup";
  if (signup.consumedAt || signup.expiresAt <= now || signup.organizationId || signup.siteId)
    throw new Error("School setup signup is no longer available");

  const slug = uniqueSlug(signup.schoolName, signup.id);
  // Old pending signups predate classification. Do not assume they are schools.
  const requestedType = publicSignupOrganizationTypeSchema.catch("other_partner").parse(signup.organizationType);
  const initialType = initialVerifiedSignupOrganizationType(requestedType);
  const [organization] = await tx.insert(organizations).values({
    type: initialType, name: signup.organizationName?.trim() || signup.schoolName,
    slug, lifecycleStatus: "active",
    domain: approval === "demo_code" ? identityEmailDomain(email) : signup.organizationDomain ?? null,
    metadata: { signup: { requestedOrganizationType: requestedType,
      classification: initialType === requestedType ? "self_reported" : "pending_verification" } },
  }).returning({ id: organizations.id });
  if (!organization) throw new Error("School organization could not be created");

  const [site] = await tx.insert(sites).values({
    organizationId: organization.id, name: signup.schoolName, slug,
    lifecycleStatus: "planning",
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
  // Account Person ownership remains durable even when the last membership
  // was revoked. Do not invent a second Person for an established founder.
  const [account] = await tx.select({personId:accessAccounts.personId})
    .from(accessAccounts).where(eq(accessAccounts.id,accountId))
    .for("update").limit(1);
  if(!account)throw new Error("Verified school founder account unavailable");
  const existingPersonId=associated[0]?.personId??account.personId;
  if(account.personId && existingPersonId!==account.personId)
    throw new Error("School founder Person differs from account identity");
  let personId=existingPersonId;
  if(personId){
    const [existing] = await tx.select({active:people.active}).from(people)
      .where(eq(people.id,personId)).limit(1);
    if(!existing?.active)throw new Error("School founder Person is not active");
  }else{
    const [createdPerson] = await tx.insert(people).values({
      legalFirstName: signup.firstName, legalLastName: signup.lastName, email, domain: identityEmailDomain(email),
    }).returning({id:people.id});
    personId=createdPerson?.id??null;
  }
  if (!personId) throw new Error("School administrator identity could not be created");
  // The CAN login's immutable Person anchor must be established in the same
  // verified-email transaction as the first Site Admin grant. Without it,
  // redeemOneTimeAccess rejects a newly registered founder at session issue.
  if (!account.personId) {
    const [bound] = await tx.update(accessAccounts).set({
      personId, updatedAt: now,
    }).where(and(eq(accessAccounts.id, accountId), isNull(accessAccounts.personId)))
      .returning({ personId: accessAccounts.personId });
    if (bound?.personId !== personId)
      throw new Error("School administrator Person binding could not be established");
  }

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
    after: { schoolName: signup.schoolName, requestedOrganizationType: requestedType,
      initialOrganizationType: initialType, initialGrantId: grant.id,
      source },
    context: { accountId, grantId: grant.id, role: "site_admin", authenticated: approval === "verified_email",
      source },
  });
  await emitEvent(tx, {
    eventType: EventTypes.SchoolSetupCompleted, aggregateType: "organization",
    aggregateId: organization.id, actorPersonId: personId,
    organizationId: organization.id, siteId: site.id,
    payload: { source },
  });
  await emitEvent(tx, {
    eventType: EventTypes.SiteCreated, aggregateType: "site", aggregateId: site.id,
    actorPersonId: personId, organizationId: organization.id, siteId: site.id,
    payload: { name: signup.schoolName, timezone: DEFAULT_SITE_TIMEZONE },
  });

  if (approval === "demo_code") {
    await tx.insert(demoSchoolTenants).values({ domain: email.split("@")[1]!, organizationId: organization.id,
      siteId: site.id, adminAccountId: accountId, adminPersonId: personId, adminGrantId: grant.id });
  }

  const [completed] = await tx.update(schoolSetupSignups).set({
    consumedAt: now, organizationId: organization.id, siteId: site.id, updatedAt: now,
  }).where(and(eq(schoolSetupSignups.id, signup.id), isNull(schoolSetupSignups.consumedAt)))
    .returning({ id: schoolSetupSignups.id });
  if (!completed) throw new Error("School setup signup was already consumed");
  return { organizationId: organization.id, siteId: site.id, grantId: grant.id };
}

/** Automatically approve a new demo founder, using the ordinary Site provisioning transaction.
 * The registry is an authentication boundary, not a different Site or Organization model.
 * Never adopt existing accounts or Sites through public signup.
 */
export async function provisionDemoSiteSignup(input: unknown) {
  const data = siteSignupSchema.parse(input);
  const domain = data.email.split("@")[1]!;
  if (!isDemoAccountEmail(data.email) || !isDemoSchoolDomain(domain) || domain === DEMO_ACCOUNT_DOMAIN)
    throw new DomainError("FORBIDDEN");
  const privateAccessCode = issueOpaqueSecret();
  const privateAccessCodeHash = hashPrivateAccessCode(privateAccessCode, process.env.CAN_ACCESS_TOKEN_PEPPER ?? "");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"demo-founder:" + domain}))`);
    // Canonical Organization identity may predate the credential registry.
    // Do not let public shared-domain signup claim an existing fixture/provider.
    const [canonicalOwner] = await tx.select({id:organizations.id}).from(organizations)
      .where(eq(organizations.domain,domain)).limit(1);
    if(canonicalOwner)throw new DomainError("CONFLICT");
    const [registered] = await tx.select().from(demoSchoolTenants)
      .where(eq(demoSchoolTenants.domain, domain)).limit(1);
    if (registered) throw new DomainError("CONFLICT");
    const [occupied] = await tx.select({id:accessAccounts.id}).from(accessAccounts)
      .where(eq(accessAccounts.emailNormalized,data.email)).limit(1);
    if (occupied) throw new DomainError("CONFLICT");
    const now = new Date();
    const [account] = await tx.insert(accessAccounts).values({emailNormalized:data.email,privateAccessCodeHash})
      .returning({id:accessAccounts.id});
    if (!account) throw new Error("Account could not be created");
    const [signup] = await tx.insert(schoolSetupSignups).values({
      accountId:account.id,schoolName:data.name,organizationName:data.organizationName??null,organizationDomain:data.organizationDomain??null,
      organizationType:data.organizationType,firstName:data.firstName,lastName:data.lastName,
      expiresAt:new Date(now.getTime()+600000),
    }).returning();
    if (!signup) throw new Error("Site signup could not be created");
    const provisioned = await provisionVerifiedSchoolSignup(tx,signup,account.id,data.email,now,"demo_code");
    // Only this successful first response carries the raw credential. Never log it.
    return {...provisioned,privateAccessCode};
  });
}
