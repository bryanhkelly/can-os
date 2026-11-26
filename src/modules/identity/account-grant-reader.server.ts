import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";

/** Canonical grant projection; credentials are represented only by a boolean.
 * Never select a credential hash into membership projections. */
export type GrantReader = Pick<Database, "select">;

export const grantSelection = {
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
  emailVerifiedAt: accessAccounts.emailVerifiedAt,
  accountPersonId: accessAccounts.personId,
  privateCredential: sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`,
};

export const supportedRoles = Object.keys(roleCapabilities);
export async function listActiveAccountGrants(accountId: string, reader: GrantReader) {
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

export type AccountGrant = Awaited<ReturnType<typeof listActiveAccountGrants>>[number];
