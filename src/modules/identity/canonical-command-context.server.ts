import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { readRestrictedCanonicalSession } from "./restricted-canonical-session-reader.server";
import { assertCurrentReviewedNativeLearner } from "./reviewed-learning-evidence.server";
import { accessAccounts, accessAccountNoncreditPrincipals, accessAdultLearningReviews } from "@/db/schema";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { getIdentityContext } from "./command-context.server";
import { resolveCanonicalSiteStaffFromCan } from "./can-site-staff-authority.server";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import {
  canonicalSessionCookie,
  canonicalSessionRowSchema,
  type CanonicalSessionRow,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";

/**
 * A completely native v3.0.1 session. No account, Person, Site, grant or
 * Organization is read from public-schema identity records.
 */
export function canonicalSessionDigestFromRequest(request: Request): string {
  const raw = readCookie(request, canonicalSessionCookie);
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw)) {
    throw new AuthorizationError("authenticated session");
  }
  const pepper = process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AuthorizationError("canonical session configuration");
  }
  return createHash("sha256")
    .update(pepper).update(":").update(raw).digest("hex");
}

/** Always revalidate against the restricted reader. Pool reuse amortizes
 * connections; caching the authorization decision across mutation boundaries
 * could preserve a revoked grant on a long-running request.
 */
export function getCanonicalSessionRow(request: Request): Promise<CanonicalSessionRow> {
  return readCanonicalSessionRow(request);
}

async function readCanonicalSessionRow(request: Request): Promise<CanonicalSessionRow> {
  const digest = canonicalSessionDigestFromRequest(request);
  const records = await readRestrictedCanonicalSession("native", digest);

  if (records.length !== 1) throw new AuthorizationError("authenticated session");
  const native=canonicalSessionRowSchema.parse(records[0]);
  if(native.role_code==="learner")
    await assertCurrentReviewedNativeLearner(native.account_id,native.person_id);
  return native;
}

/**
 * Readiness requires an actual restricted login, SET ROLE, and execution of
 * the same canonical session projection used by authenticated requests.
 * Never test with the general/owner database URL or a real user's token.
 *
 * A brief cache avoids opening a new connection for every page visit.
 * No credentials, SQL errors or account information enter the response.
 */
let readerProbeCache: { until: number; ready: boolean } = { until: 0, ready: false };
let pendingReaderProbe: Promise<boolean> | null = null;

async function runCanonicalReaderProbe(): Promise<boolean> {
  const url = process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
  if (!canonicalRestrictedAuthUrlValid(url, process.env.DATABASE_URL) ||
      (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) < 32) return false;
  try {
    // Uses the same restricted DB role and reader as real authentication.
    // A cryptographically random digest must not identify a real session.
    const records = await readRestrictedCanonicalSession(
      "native", randomBytes(32).toString("hex"),
    );
    return records.length === 0;
  } catch {
    return false;
  }
}

export async function probeCanonicalAuthReader(): Promise<boolean> {
  if (!canonicalRestrictedAuthUrlValid(
    process.env.CAN_CANONICAL_AUTH_DATABASE_URL, process.env.DATABASE_URL,
  ) || (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) < 32) return false;
  const now = Date.now();
  if (readerProbeCache.until > now) return readerProbeCache.ready;
  if (!pendingReaderProbe) {
    pendingReaderProbe = runCanonicalReaderProbe().then(ready => {
      readerProbeCache = { ready, until: Date.now() + (ready ? 60_000 : 2_000) };
      return ready;
    }).finally(() => { pendingReaderProbe = null; });
  }
  return pendingReaderProbe;
}

/**
 * One sign-in for CAN school staff. Resolve the verified CAN session first
 * when its active grant is Site Admin or Registrar, then require independent
 * Person + Site bridges and a live matching canonical grant. This projection
 * creates no second bearer cookie and grants no rights for unmapped schools.
 *
 * Other canonical roles retain their existing native session handling until
 * their separately reviewed identity/role mappings are supported. A broken
 * CAN session must never fall back to a native cookie or silently switch roles.
 */
export async function getCanonicalCommandContext(request: Request): Promise<CommandContext> {
  const hasCan = readCookie(request, accessSessionCookie) !== undefined;
  const hasNative = readCookie(request, canonicalSessionCookie) !== undefined;
  if (hasCan) {
    const actor = await getIdentityContext(request);
    if (actor.role === "site_admin" || actor.role === "registrar") {
      return resolveCanonicalSiteStaffFromCan(actor, request);
    }
    if (!actor.actorPersonId || actor.sessionAccountId) {
      throw new AuthorizationError("authorized canonical identity for active CAN account");
    }
    // Only the ABSENCE of a native learner cookie is recoverable. An invalid,
    // mismatched, revoked, staff or reviewer session is an authorization denial
    // and must never trigger automatic privilege or identity recovery.
    if (!hasNative) {
      throw new DomainError("CANONICAL_LEARNER_SESSION_REQUIRED");
    }

    // Adult noncredit learners can retain their existing native course-session
    // cookie without a second interactive sign-in. Both active credentials
    // must resolve to the SAME previously consented person/account pair.
    // A native staff/reviewer cookie cannot be combined with an unrelated
    // CAN student, guardian, or personal session to switch identities.
    const native = await getCanonicalSessionRow(request);
    if (native.role_code !== "learner" || native.site_id !== null) {
      throw new AuthorizationError("canonical role does not match CAN login");
    }
    const [source] = await db.select({
      email: accessAccounts.emailNormalized,
      verified: accessAccounts.emailVerifiedAt,
      disabled: accessAccounts.disabled,
    }).from(accessAccounts)
      .where(eq(accessAccounts.id, actor.accountId)).limit(1);
    if (!source?.verified || source.disabled || isDemoAccountEmail(source.email)) {
      throw new AuthorizationError("current verified CAN learner account");
    }
    const links = await db.select({
      personId: accessAccountNoncreditPrincipals.accessPersonId,
      nativeAccountId: accessAccountNoncreditPrincipals.canonicalAccountId,
      nativePersonId: accessAccountNoncreditPrincipals.canonicalPersonId,
    }).from(accessAccountNoncreditPrincipals)
      .where(and(
        eq(accessAccountNoncreditPrincipals.accessAccountId, actor.accountId),
        eq(accessAccountNoncreditPrincipals.accessPersonId, actor.actorPersonId),
      )).limit(2);
    if (links.length !== 1 ||
        links[0]?.nativeAccountId !== native.account_id ||
        links[0]?.nativePersonId !== native.person_id) {
      throw new AuthorizationError("one verified CAN-to-canonical learner identity");
    }
    // A native bearer and a CAN cookie cannot together bypass a revoked or
    // half-consumed reviewed identity. The review applies to this account,
    // NOT to every independent native learner who has never had a review.
    const [adultReview] = await db.select({
      status:accessAdultLearningReviews.status,
      consumedAt:accessAdultLearningReviews.consumedAt,
      personId:accessAdultLearningReviews.accessPersonId,
      canonicalAccountId:accessAdultLearningReviews.canonicalAccountId,
      canonicalPersonId:accessAdultLearningReviews.canonicalPersonId,
    }).from(accessAdultLearningReviews).where(
      eq(accessAdultLearningReviews.accessAccountId,actor.accountId),
    ).limit(1);
    if(adultReview && (adultReview.status!=="approved"||
       adultReview.personId!==actor.actorPersonId||
       (adultReview.consumedAt
         ? adultReview.canonicalAccountId!==native.account_id||
           adultReview.canonicalPersonId!==native.person_id
         : adultReview.canonicalAccountId!==null||
           adultReview.canonicalPersonId!==null)))
      throw new AuthorizationError("current reviewed learner identity");
    return projectCanonicalCommandContext(native);
  }
  return projectCanonicalCommandContext(await getCanonicalSessionRow(request));
}
