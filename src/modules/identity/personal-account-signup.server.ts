import { identityEmailDomain } from "@/domain/domain-classification";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccountSignups, accessAccounts, accountPersonGrants, people, schoolSetupSignups,
} from "@/db/schema";
import { issuePrivateAccountCredential } from "./private-account-credential.server";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { personalCanSignupSchema } from "@/domain/personal-account-signup";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { requestOneTimeAccess } from "./passwordless-access.server";
import { sendAccessLinkViaResend, type AccessEmailSender } from "./resend-access-mail.server";
import { writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const SIGNUP_LIFETIME_MS = 20 * 60_000;
const genericResult = { accepted: true } as const;

/**
 * Registration never creates an institution or an active Person.
 * The email challenge is the proof of mailbox possession; all responses are generic.
 */
export async function requestPersonalCanAccount(input: unknown,
  sender: AccessEmailSender = sendAccessLinkViaResend): Promise<{accepted:true;privateAccessCode?:string}> {
  const data = personalCanSignupSchema.parse(input);
  const email = normalizeAccessEmail(data.email);
  const demo = isDemoAccountEmail(email);
  if (email.endsWith(".invalid") || (email.endsWith(".demo") && !demo)) return genericResult;
  if (demo) return provisionPrivatePersonalSignup(data,email);
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
      .where(and(eq(accountPersonGrants.accountId, account.id),
        eq(accountPersonGrants.active, true))).limit(1);
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
      // A consumed prior signup is historical evidence, not an eternal ban
      // on creating an account-only membership after roles were revoked.
      // Preserve all unfinished registrations, even after the old link expires.
      // The common issuer renews the window atomically with a new challenge.
      if (!existing.consumedAt) {
        return;
      }
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

/** Public registration can issue an individual credential only for a genuinely
 * new Account. An existing invitation, Account, or revoked identity cannot be
 * claimed through registration. No Organization or membership is inferred. */
async function provisionPrivatePersonalSignup(data: ReturnType<typeof personalCanSignupSchema.parse>, email:string) {
  const {privateAccessCode,privateAccessCodeHash}=issuePrivateAccountCredential();
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"personal-signup:" + email}))`);
    const now=new Date();
    const [account]=await tx.insert(accessAccounts).values({emailNormalized:email,privateAccessCodeHash})
      .onConflictDoNothing().returning({id:accessAccounts.id});
    if(!account)return genericResult;
    await tx.insert(accessAccountSignups).values({accountId:account.id,firstName:data.firstName,lastName:data.lastName,
      expiresAt:new Date(now.getTime()+SIGNUP_LIFETIME_MS)});
    const grantId=await provisionVerifiedPersonalCanAccount(tx,account.id,email,now,"demo_code");
    if(!grantId)throw new Error("Personal account approval unavailable");
    return {...genericResult,privateAccessCode};
  });
}

/** Called only inside atomic, single-use email-token redemption. */
export async function provisionVerifiedPersonalCanAccount(tx: Tx, accountId: string,
  email: string, now: Date, approval: "verified_email" | "demo_code" = "verified_email"): Promise<string | null> {
  if ((approval==="demo_code")!==isDemoAccountEmail(email)) throw new Error("Invalid account approval method");
  const source=approval==="demo_code"?"automatic_demo_approval":"single_use_email_verification";
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
  // A previously authorized account remains the SAME Person even after
  // every role is revoked. Revocation cannot produce a second human identity.
  const [account] = await tx.select({personId:accessAccounts.personId})
    .from(accessAccounts).where(eq(accessAccounts.id,accountId))
    .for("update").limit(1);
  if (!account) throw new Error("Verified CAN account unavailable");
  let personId=account.personId;
  if(personId){
    const [existing] = await tx.select({active:people.active}).from(people)
      .where(eq(people.id,personId)).limit(1);
    if(!existing?.active)throw new Error("CAN account Person is not active");
  }else{
    const [created] = await tx.insert(people).values({
      legalFirstName: signup.firstName, legalLastName: signup.lastName, email, domain: identityEmailDomain(email),
      metadata: {
        origin: approval==="demo_code"?"demo_personal_signup":"verified_email_personal_signup",
        nameEvidence: "self_declared",
        legalNameVerified: false,
      },
    }).returning({id:people.id});
    if(!created)throw new Error("Personal profile could not be initialized");
    personId=created.id;
  }
  if (!account.personId) {
    const [bound]=await tx.update(accessAccounts).set({personId,updatedAt:now})
      .where(and(eq(accessAccounts.id,accountId),isNull(accessAccounts.personId)))
      .returning({personId:accessAccounts.personId});
    if(bound?.personId!==personId)throw new Error("Personal account identity binding failed");
  }
  const [grant] = await tx.insert(accountPersonGrants).values({
    accountId, personId, role: "account_holder",
    organizationId: null, siteId: null, active: true,
  }).returning({ id: accountPersonGrants.id });
  if (!grant) throw new Error("Personal CAN access could not be initialized");
  await writeAudit(tx, {
    actorPersonId: personId,
    action: "identity.personal_account.created",
    resourceType: "access_account",
    resourceId: accountId,
    scope: {},
    after: {
      personalGrantId: grant.id,
      emailVerified: approval==="verified_email",
      approvalMethod:approval,
      nameEvidence: "self_declared",
      institutionGranted: false,
    },
    context: { accountId, source },
  });
  await tx.update(accessAccountSignups).set({ consumedAt: now })
    .where(eq(accessAccountSignups.accountId, accountId));
  return grant.id;
}
