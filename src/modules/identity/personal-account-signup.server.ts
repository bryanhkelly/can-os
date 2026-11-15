import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccountSignups, accessAccounts, accountPersonGrants, people, schoolSetupSignups,
} from "@/db/schema";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { personalCanSignupSchema } from "@/domain/personal-account-signup";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { requestOneTimeAccess } from "./passwordless-access.server";
import { sendAccessLinkViaResend, type AccessEmailSender } from "./resend-access-mail.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const SIGNUP_LIFETIME_MS = 20 * 60_000;
const genericResult = { accepted: true } as const;

/**
 * Registration never creates an institution or an active Person.
 * The email challenge is the proof of mailbox possession; all responses are generic.
 */
export async function requestPersonalCanAccount(input: unknown,
  sender: AccessEmailSender = sendAccessLinkViaResend): Promise<typeof genericResult> {
  const data = personalCanSignupSchema.parse(input);
  const email = normalizeAccessEmail(data.email);
  if (isDemoAccountEmail(email) || email.endsWith(".invalid")) return genericResult;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"personal-signup:" + email}))`);
    let [account] = await tx.select({
      id: accessAccounts.id, disabled: accessAccounts.disabled,
    }).from(accessAccounts).where(eq(accessAccounts.emailNormalized, email)).limit(1);
    if (!account) {
      const [created] = await tx.insert(accessAccounts).values({
        emailNormalized: email,
      }).onConflictDoNothing().returning({ id: accessAccounts.id, disabled: accessAccounts.disabled });
      account = created ?? (await tx.select({
        id: accessAccounts.id, disabled: accessAccounts.disabled,
      }).from(accessAccounts).where(eq(accessAccounts.emailNormalized, email)).limit(1))[0];
    }
    if (!account || account.disabled) return;
    const [grant] = await tx.select({ id: accountPersonGrants.id }).from(accountPersonGrants)
      .where(eq(accountPersonGrants.accountId, account.id)).limit(1);
    const [schoolSignup] = await tx.select({ id: schoolSetupSignups.id }).from(schoolSetupSignups)
      .where(and(eq(schoolSetupSignups.accountId, account.id),
        isNull(schoolSetupSignups.consumedAt), gt(schoolSetupSignups.expiresAt, new Date()))).limit(1);
    // Real existing school/staff/guardian identities are never overwritten by
    // an anonymous signup; the same email receives its ordinary sign-in link.
    if (grant || schoolSignup) return;
    const [existing] = await tx.select().from(accessAccountSignups)
      .where(eq(accessAccountSignups.accountId, account.id)).for("update").limit(1);
    const expiresAt = new Date(Date.now() + SIGNUP_LIFETIME_MS);
    if (existing) {
      // Don't let repeated unverified requests rewrite another signup's name.
      if (existing.consumedAt || existing.expiresAt > new Date()) return;
      await tx.update(accessAccountSignups).set({
        firstName: data.firstName, lastName: data.lastName, expiresAt, consumedAt: null,
      }).where(eq(accessAccountSignups.accountId, account.id));
    } else {
      await tx.insert(accessAccountSignups).values({
        accountId: account.id, firstName: data.firstName, lastName: data.lastName, expiresAt,
      });
    }
  });
  await requestOneTimeAccess(email, sender, safeAccessReturnTo(data.returnTo) ?? "/account/");
  return genericResult;
}

/** Called only inside atomic, single-use email-token redemption. */
export async function provisionVerifiedPersonalCanAccount(tx: Tx, accountId: string,
  email: string, now: Date): Promise<string | null> {
  const [signup] = await tx.select().from(accessAccountSignups).where(and(
    eq(accessAccountSignups.accountId, accountId), isNull(accessAccountSignups.consumedAt),
    gt(accessAccountSignups.expiresAt, now),
  )).for("update").limit(1);
  if (!signup) return null;
  const [activeGrant] = await tx.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, true))).limit(1);
  // An accepted institution invitation or a newly provisioned school is
  // authoritative; do not create a second Person for the same verified email.
  if (activeGrant) {
    await tx.update(accessAccountSignups).set({ consumedAt: now })
      .where(eq(accessAccountSignups.accountId, accountId));
    return null;
  }
  const [person] = await tx.insert(people).values({
    legalFirstName: signup.firstName, legalLastName: signup.lastName, email,
  }).returning({ id: people.id });
  if (!person) throw new Error("Personal profile could not be initialized");
  const [grant] = await tx.insert(accountPersonGrants).values({
    accountId, personId: person.id, role: "account_holder",
    organizationId: null, siteId: null, active: true,
  }).returning({ id: accountPersonGrants.id });
  if (!grant) throw new Error("Personal CAN access could not be initialized");
  await tx.update(accessAccountSignups).set({ consumedAt: now })
    .where(eq(accessAccountSignups.accountId, accountId));
  return grant.id;
}
