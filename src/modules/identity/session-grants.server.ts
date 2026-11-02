import { and, eq, inArray, like } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { DEMO_ACCOUNT_DOMAIN, isDemoAccountEmail, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

type GrantReader = Pick<Database, "select">;

const grantSelection = {
  id: accountPersonGrants.id, accountId: accountPersonGrants.accountId,
  personId: accountPersonGrants.personId, role: accountPersonGrants.role,
  organizationId: accountPersonGrants.organizationId, siteId: accountPersonGrants.siteId,
  active: accountPersonGrants.active, firstName: people.legalFirstName, lastName: people.legalLastName,
  email: accessAccounts.emailNormalized,
};

/** Demo delegation requires the fixed admin identity's current, ordinary membership. */
export async function readSessionGrants(accountId: string, email: string, reader: GrantReader = db) {
  const demoAccount = isDemoAccountEmail(email);
  const adminAccount = accountId === LOCAL_DEMO_ADMIN.accountId && email === LOCAL_DEMO_ADMIN.email;
  const ownGrants = await reader.select(grantSelection).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.accountId, accountId), eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false), eq(people.active, true),
      demoAccount ? eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId) : undefined,
      demoAccount ? eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId) : undefined,
      inArray(accountPersonGrants.role, Object.keys(roleCapabilities)),
    ));
  if (!adminAccount) return { grants: ownGrants, demoAccountSwitching: false };
  if (!ownGrants.some(grant => grant.id === LOCAL_DEMO_ADMIN.grantId &&
    grant.personId === LOCAL_DEMO_ADMIN.personId && grant.role === "registrar")) {
    throw new AuthorizationError("active demo administrator membership");
  }
  const grants = await reader.select(grantSelection).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.active, true), eq(accessAccounts.disabled, false), eq(people.active, true),
      like(accessAccounts.emailNormalized, `%@${DEMO_ACCOUNT_DOMAIN}`),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
      inArray(accountPersonGrants.role, Object.keys(roleCapabilities)),
    ));
  return { grants, demoAccountSwitching: true };
}
