import { and, eq, gt, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accessSessions, accountPersonGrants, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { accessSessionCookie, hashAccessSecret, hashPrivateAccessCode, issueOpaqueSecret, sessionIdleCutoff } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { roleCapabilities } from "@/domain/access-context";
import { platformOwnerMayActAs, ownerDelegationLifetimeMs } from "@/domain/platform-owner-delegation";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { readOwnerDelegationGrants } from "./session-grants.server";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const delegationRequest = z.object({
  grantId: uuid,
  mode: z.enum(["view", "act"]),
  reason: z.string().trim().min(12).max(500),
}).strict();
export type PlatformOwnerDelegationRequest = z.infer<typeof delegationRequest>;


/** The caller's signed cookie and original account-wide owner membership,
 * NOT the effective impersonated identity, are the authority for this operation.
 * Always recheck the grant, the one-Person invariant, account verification and
 * the session's idle and absolute expiration.
 */
export async function getVerifiedPlatformOwnerSession(request: Request) {
  const token = readCookie(request, accessSessionCookie);
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!token || !/^[A-Za-z0-9_-]{40,}$/.test(token) || !pepper || pepper.length < 32)
    throw new AuthorizationError("verified Platform Owner session");
  const now = new Date();
  const [owner] = await db.select({
    sessionId: accessSessions.id,
    ownerAccountId: accessSessions.accountId,
    ownerPersonId: accessAccounts.personId,
    ownerEmail: accessAccounts.emailNormalized,
    grantId: accountPersonGrants.id,
    grantPersonId: accountPersonGrants.personId,
    accountVerifiedAt: accessAccounts.emailVerifiedAt,
    accountDisabled: accessAccounts.disabled,
    personActive: people.active,
    sessionSharedDevice: accessSessions.sharedDevice,
    lastActivityAt: accessSessions.lastActivityAt,
    expiresAt: accessSessions.expiresAt,
    delegatedGrantId: accessSessions.delegatedGrantId,
    delegatedMode: accessSessions.delegatedMode,
    delegatedUntil: accessSessions.delegatedUntil,
  }).from(accessSessions)
    .innerJoin(accessAccounts, eq(accessSessions.accountId, accessAccounts.id))
    .innerJoin(accountPersonGrants, eq(accessSessions.activeGrantId, accountPersonGrants.id))
    .innerJoin(people, eq(accountPersonGrants.personId, people.id))
    .where(and(
      eq(accessSessions.secretHash, hashAccessSecret(token, pepper)),
      isNull(accessSessions.revokedAt),
      gt(accessSessions.expiresAt, now),
      gt(accessSessions.updatedAt, sessionIdleCutoff(now)),
      eq(accountPersonGrants.role, "platform_owner"),
      eq(accountPersonGrants.accountId, accessSessions.accountId),
      eq(accountPersonGrants.active, true),
      isNull(accountPersonGrants.organizationId),
      isNull(accountPersonGrants.siteId),
    )).limit(1);
  if (!owner || !owner.ownerPersonId || owner.ownerPersonId !== owner.grantPersonId ||
      !owner.accountVerifiedAt || owner.accountDisabled || !owner.personActive ||
      isDemoAccountEmail(owner.ownerEmail) ||
      (owner.sessionSharedDevice && now.getTime() - owner.lastActivityAt.getTime() >= 5 * 60_000))
    throw new AuthorizationError("verified Platform Owner identity");
  await assertRawAccountPerson(owner.ownerAccountId, owner.ownerPersonId);
  return owner;
}

/** Owner-only management must not be available inside a delegated session. */
export function assertPlatformOwnerUndelegated(owner:{delegatedGrantId:string|null}) {
  if(owner.delegatedGrantId) throw new AuthorizationError("return to Platform Owner first");
}

/** Opaque existing grant IDs are resolved from current eligible canonical accounts.
 * No impersonated persona, organization relationship or preview record is created.
 */
export async function listPlatformOwnerTargets(request: Request, search: string) {
  const owner = await getVerifiedPlatformOwnerSession(request);
  assertPlatformOwnerUndelegated(owner);
  const query = z.string().trim().min(2).max(100).parse(search);
  const escaped = query.replace(/[\\%_]/g, char => "\\" + char);
  const term = "%" + escaped + "%";
  const rows = await db.select({
    grantId: accountPersonGrants.id,
    accountId: accountPersonGrants.accountId,
    personId: accountPersonGrants.personId,
    role: accountPersonGrants.role,
    firstName: people.legalFirstName,
    lastName: people.legalLastName,
    email: accessAccounts.emailNormalized,
    privateAccessCodeEnabled: sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`,
    organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId,
  }).from(accountPersonGrants)
    .innerJoin(accessAccounts, and(
      eq(accessAccounts.id, accountPersonGrants.accountId),
      eq(accessAccounts.personId, accountPersonGrants.personId),
      eq(accessAccounts.disabled, false),
      or(isNotNull(accessAccounts.emailVerifiedAt), sql`${accessAccounts.emailNormalized} LIKE '%.demo'`)))
    .innerJoin(people, and(
      eq(people.id, accountPersonGrants.personId),
      eq(people.active, true)))
    .where(and(
      eq(accountPersonGrants.active, true),
      sql`${accountPersonGrants.role} <> 'platform_owner'`,
      sql`${accountPersonGrants.accountId} <> ${owner.ownerAccountId}`,
      or(ilike(accessAccounts.emailNormalized, term),
        ilike(people.legalFirstName, term),
        ilike(people.legalLastName, term)),
    )).limit(26);
  const eligible = await Promise.all(rows.map(async row => {
    if (!Object.hasOwn(roleCapabilities, row.role)) return null;
    const grants = await readOwnerDelegationGrants(row.accountId, row.personId, row.email);
    return grants.some(grant => grant.id === row.grantId) ? row : null;
  }));
  return { targets: eligible.filter(row => row !== null).slice(0,25), limited: rows.length > 25 };
}

/** Independent-account authorizations are rechecked again when the delegated
 * session resolves. No grant can target another Platform Owner.
 */
export async function startPlatformOwnerDelegation(request: Request, raw: unknown) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AuthorizationError("same-origin owner delegation");
  const data = delegationRequest.parse(raw);
  const owner = await getVerifiedPlatformOwnerSession(request);
  assertPlatformOwnerUndelegated(owner);
  const now = new Date();
  const expiresAt = new Date(Math.min(now.getTime() + ownerDelegationLifetimeMs,
    owner.expiresAt.getTime()));
  if (expiresAt <= now) throw new AuthorizationError("current owner session");
  return db.transaction(async tx => {
    const [target] = await tx.select({
      grantId: accountPersonGrants.id,
      accountId: accountPersonGrants.accountId,
      personId: accountPersonGrants.personId,
      role: accountPersonGrants.role,
      email: accessAccounts.emailNormalized,
      verifiedAt: accessAccounts.emailVerifiedAt,
      accountPersonId: accessAccounts.personId,
      accountDisabled: accessAccounts.disabled,
      personActive: people.active,
    }).from(accountPersonGrants)
      .innerJoin(accessAccounts, eq(accountPersonGrants.accountId, accessAccounts.id))
      .innerJoin(people, eq(accountPersonGrants.personId, people.id))
      .where(eq(accountPersonGrants.id, data.grantId)).limit(1);
    if (!target || target.accountId === owner.ownerAccountId ||
        target.role === "platform_owner" || !Object.hasOwn(roleCapabilities, target.role) ||
        !target.personActive || target.accountDisabled ||
        target.accountPersonId !== target.personId)
      throw new AuthorizationError("existing eligible delegate");
    const grants = await readOwnerDelegationGrants(target.accountId, target.personId, target.email, tx);
    if (!grants.some(grant => grant.id === target.grantId && grant.active))
      throw new AuthorizationError("current delegated membership");
    await assertRawAccountPerson(target.accountId, target.personId, tx);
    // Do not let delegation authorize a simulated independent reviewer decision.
    // Reviewer roles may be inspected with "View as" only.
    if (data.mode === "act" && !platformOwnerMayActAs(target.role))
      throw new AuthorizationError("independent role: use View as");
    const [changed] = await tx.update(accessSessions).set({
      delegatedGrantId: target.grantId, delegatedMode: data.mode,
      delegatedUntil: expiresAt, delegatedReason: data.reason, updatedAt: now,
      lastActivityAt: now,
    }).where(and(
      eq(accessSessions.id, owner.sessionId),
      eq(accessSessions.accountId, owner.ownerAccountId),
      eq(accessSessions.activeGrantId, owner.grantId),
      isNull(accessSessions.delegatedGrantId),
      isNull(accessSessions.revokedAt),
      gt(accessSessions.expiresAt, now),
    )).returning({ id: accessSessions.id });
    if (!changed) throw new AuthorizationError("owner session changed");
    await writeAudit(tx, {
      actorPersonId: owner.ownerPersonId,
      action: "platform.owner.delegation.started",
      resourceType: "access_session",
      resourceId: owner.sessionId,
      scope: {},
      context: {
        ownerAccountId: owner.ownerAccountId,
        ownerPersonId: owner.ownerPersonId,
        effectiveAccountId: target.accountId,
        effectivePersonId: target.personId,
        effectiveGrantId: target.grantId,
        effectiveRole: target.role,
        mode: data.mode,
        expiresAt: expiresAt.toISOString(),
        reason: data.reason,
      },
    });
    return { mode: data.mode, expiresAt: expiresAt.toISOString() };
  });
}

export async function stopPlatformOwnerDelegation(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AuthorizationError("same-origin owner delegation");
  const owner = await getVerifiedPlatformOwnerSession(request);
  return db.transaction(async tx => {
    const [changed] = await tx.update(accessSessions).set({
      delegatedGrantId: null, delegatedMode: null, delegatedUntil: null,
      delegatedReason: null, updatedAt: new Date(), lastActivityAt: new Date(),
    }).where(and(
      eq(accessSessions.id, owner.sessionId),
      eq(accessSessions.accountId, owner.ownerAccountId),
      eq(accessSessions.activeGrantId, owner.grantId),
      isNull(accessSessions.revokedAt),
    )).returning({ id: accessSessions.id });
    if (!changed) throw new AuthorizationError("owner session changed");
    await writeAudit(tx, {
      actorPersonId: owner.ownerPersonId,
      action: "platform.owner.delegation.ended",
      resourceType: "access_session", resourceId: owner.sessionId,
      scope: {}, context: { ownerAccountId: owner.ownerAccountId,
        previousGrantId: owner.delegatedGrantId, previousMode: owner.delegatedMode },
    });
    return { stopped: true };
  });
}

/** Recover an already-issued private credential without reverting to a public
 * shared code. Only an independently authenticated, undelegated owner may
 * perform this operation. Protected roles cannot be acquired by rotation. */
export async function rotatePrivateAccountAccessCode(request: Request, raw: unknown) {
  if(request.headers.get("origin")!==new URL(request.url).origin)
    throw new AuthorizationError("same-origin credential recovery");
  const data=z.object({grantId:uuid,reason:z.string().trim().min(12).max(500),confirm:z.literal(true),operation:z.enum(["enroll","rotate"]).default("rotate")}).strict().parse(raw);
  const owner=await getVerifiedPlatformOwnerSession(request);
  assertPlatformOwnerUndelegated(owner);
  const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
  if(!pepper||pepper.length<32)throw new Error("Account access is temporarily unavailable");
  return db.transaction(async tx=>{
    const [target]=await tx.select({accountId:accountPersonGrants.accountId,personId:accountPersonGrants.personId,
      role:accountPersonGrants.role}).from(accountPersonGrants)
      .where(and(eq(accountPersonGrants.id,data.grantId),eq(accountPersonGrants.active,true))).limit(1);
    if(!target||target.accountId===owner.ownerAccountId||!platformOwnerMayActAs(target.role))
      throw new AuthorizationError("eligible existing private-code account");
    const [account]=await tx.select({id:accessAccounts.id,personId:accessAccounts.personId,email:accessAccounts.emailNormalized,
      privateAccessCodeHash:accessAccounts.privateAccessCodeHash,disabled:accessAccounts.disabled})
      .from(accessAccounts).where(eq(accessAccounts.id,target.accountId)).for("update").limit(1);
    if(!account||account.disabled||account.personId!==target.personId||!isDemoAccountEmail(account.email)||
      (data.operation==="rotate"?!account.privateAccessCodeHash:!!account.privateAccessCodeHash))
      throw new AuthorizationError("existing private-code account");
    const eligible=await readOwnerDelegationGrants(account.id,target.personId,account.email,tx);
    const allGrants=await tx.select({role:accountPersonGrants.role,personId:accountPersonGrants.personId})
      .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true))).limit(101);
    if(!eligible.some(grant=>grant.id===data.grantId)||!allGrants.length||allGrants.length>100||
      allGrants.some(grant=>grant.personId!==target.personId||!platformOwnerMayActAs(grant.role)))
      throw new AuthorizationError("independently protected account");
    const privateAccessCode=issueOpaqueSecret();
    const now=new Date();
    await tx.update(accessAccounts).set({privateAccessCodeHash:hashPrivateAccessCode(privateAccessCode,pepper),updatedAt:now})
      .where(eq(accessAccounts.id,account.id));
    const revoked=await tx.update(accessSessions).set({revokedAt:now,updatedAt:now})
      .where(and(eq(accessSessions.accountId,account.id),isNull(accessSessions.revokedAt)))
      .returning({id:accessSessions.id});
    await writeAudit(tx,{actorPersonId:owner.ownerPersonId,action:data.operation==="enroll"?"identity.private_access_code.enrolled":"identity.private_access_code.rotated",
      resourceType:"account",resourceId:account.id,scope:{},context:{
        ownerAccountId:owner.ownerAccountId,targetPersonId:target.personId,grantId:data.grantId,
        reason:data.reason,revokedCount:revoked.length,
      }});
    return {privateAccessCode,revokedCount:revoked.length};
  });
}
