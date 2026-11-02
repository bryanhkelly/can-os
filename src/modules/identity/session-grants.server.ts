import { and, eq, inArray } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import {
  isDemoAccountEmail,
  isApprovedDemoGrant,
  LOCAL_DEMO_ACCOUNTS,
  LOCAL_DEMO_ADMIN,
} from "@/domain/local-demo-access";

type GrantReader = Pick<Database, "select">;

const grantSelection = {
  id: accountPersonGrants.id,
  accountId: accountPersonGrants.accountId,
  personId: accountPersonGrants.personId,
  role: accountPersonGrants.role,
  organizationId: accountPersonGrants.organizationId,
  siteId: accountPersonGrants.siteId,
  active: accountPersonGrants.active,
  firstName: people.legalFirstName,
  lastName: people.legalLastName,
  email: accessAccounts.emailNormalized,
};

const supportedRoles = Object.keys(roleCapabilities);
const sourceAccounts = LOCAL_DEMO_ACCOUNTS.filter(
  account => account.email !== LOCAL_DEMO_ADMIN.email,
);

async function listActiveAccountGrants(accountId: string, reader: GrantReader) {
  return reader.select(grantSelection).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false),
      eq(people.active, true),
      inArray(accountPersonGrants.role, supportedRoles),
    ));
}

/** Current, tenant-bound source memberships; no mirrored admin grants are accepted. */
export async function listDemoSourceGrants(database: GrantReader = db) {
  const rows = await database.select(grantSelection).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      inArray(accessAccounts.emailNormalized, sourceAccounts.map(account => account.email)),
      eq(accessAccounts.disabled, false),
      eq(people.active, true),
      eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
      inArray(accountPersonGrants.role, supportedRoles),
    ));
  return rows.filter(row =>
    isApprovedDemoGrant(row, row.email),
  );
}

/** Resolve only current account grants or the separately provisioned demo-admin switch list. */
export async function readSessionGrants(accountId: string, email: string, reader: GrantReader = db) {
  const normalizedEmail = email.trim().toLowerCase();
  const demoAccount = isDemoAccountEmail(normalizedEmail) ||
    LOCAL_DEMO_ACCOUNTS.some(account => account.accountId === accountId);
  const adminAccount =
    accountId === LOCAL_DEMO_ADMIN.accountId || normalizedEmail === LOCAL_DEMO_ADMIN.email;
  const ownGrants = (await listActiveAccountGrants(accountId, reader))
    .filter(grant => grant.accountId === accountId);

  if (!adminAccount && !demoAccount) {
    return { grants: ownGrants, demoAccountSwitching: false };
  }

  if (adminAccount) {
    if (accountId !== LOCAL_DEMO_ADMIN.accountId || normalizedEmail !== LOCAL_DEMO_ADMIN.email) {
      throw new AuthorizationError("active demo administrator membership");
    }
    const adminGrant = ownGrants.find(grant =>
      grant.id === LOCAL_DEMO_ADMIN.grantId &&
      isApprovedDemoGrant(grant, normalizedEmail),
    );
    if (!adminGrant) throw new AuthorizationError("active demo administrator membership");
    const grants = await listDemoSourceGrants(reader);
    return { grants: [adminGrant, ...grants], demoAccountSwitching: true };
  }

  const grants = ownGrants.filter(grant =>
    isApprovedDemoGrant(grant, normalizedEmail),
  );
  return { grants, demoAccountSwitching: false };
}
