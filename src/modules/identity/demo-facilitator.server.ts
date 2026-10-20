import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { isLocalDemoAccessEnabled, LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

type Reader = Pick<Database, "select">;

export async function listDemoSourceGrants(database: Reader) {
  const rows = await database.select({
    id: accountPersonGrants.id, accountId: accessAccounts.id, email: accessAccounts.emailNormalized,
    personId: people.id, firstName: people.legalFirstName, lastName: people.legalLastName,
    role: accountPersonGrants.role, organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId, active: accountPersonGrants.active,
    metadata: people.metadata,
  }).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      inArray(accessAccounts.emailNormalized, LOCAL_DEMO_ACCOUNTS.filter(account => account.email !== LOCAL_DEMO_ADMIN.email).map(account => account.email)),
      eq(accessAccounts.disabled, false), eq(people.active, true),
      eq(accountPersonGrants.active, true), eq(accountPersonGrants.isSynthetic, true),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
    ));
  return rows.filter(row => row.metadata.synthetic === true &&
    LOCAL_DEMO_ACCOUNTS.some(account => account.email === row.email && account.role.toLowerCase() === row.role));
}

/** A facilitator selects original user grants, never duplicate staffing memberships. */
export async function listDemoFacilitatorGrants(database: Reader) {
  if (!isLocalDemoAccessEnabled(process.env) || process.env.CAN_DEMO_WRITES_ENABLED !== "true") {
    throw new AuthorizationError("local demo facilitator access");
  }
  const grants = await database.select({
    id: accountPersonGrants.id, accountId: accountPersonGrants.accountId, personId: people.id,
    role: accountPersonGrants.role, organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId, active: accountPersonGrants.active,
    isSynthetic: accountPersonGrants.isSynthetic,
    firstName: people.legalFirstName, lastName: people.legalLastName, metadata: people.metadata,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(eq(accountPersonGrants.accountId, LOCAL_DEMO_ADMIN.accountId),
      eq(accessAccounts.emailNormalized, LOCAL_DEMO_ADMIN.email), eq(accessAccounts.disabled, false),
      eq(accountPersonGrants.active, true), eq(people.active, true),
      eq(accountPersonGrants.isSynthetic, true),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId)));
  if (!grants.some(grant => grant.id === LOCAL_DEMO_ADMIN.facilitatorGrantId &&
    grant.personId === LOCAL_DEMO_ADMIN.personId && grant.role === "demo_facilitator" && grant.metadata.synthetic === true)) {
    throw new AuthorizationError("active synthetic facilitator grant");
  }
  const sources = await listDemoSourceGrants(database);
  return [...grants.filter(grant => grant.metadata.synthetic === true &&
    grant.id === LOCAL_DEMO_ADMIN.grantId && grant.personId === LOCAL_DEMO_ADMIN.personId && grant.role === "registrar"),
  ...sources];
}
