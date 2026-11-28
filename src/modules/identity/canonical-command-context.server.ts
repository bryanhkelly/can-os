import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { readRestrictedCanonicalSession } from "./restricted-canonical-session-reader.server";
import { assertUnambiguousAdultAccount } from "./unambiguous-adult-account.server";
import { assertCurrentReviewedNativeLearner } from "./reviewed-learning-evidence.server";
import { accessAccounts, accessAccountNoncreditPrincipals, accessAdultLearningReviews } from "@/db/schema";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { getIdentityContext } from "./command-context.server";
import { studentSiteScope } from "@/domain/student-site-scope";
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
  if(native.role_code==="learner"){
    // Even callers of this low-level native session reader must supply a
    // real CAN login. Its presence alone does not authorize participation:
    // canonical command contexts still verify the active CAN account/grant,
    // independently reviewed identity, and exact native Person binding.
    const can = readCookie(request, accessSessionCookie);
    if(!can || !/^[A-Za-z0-9_-]{40,}$/.test(can))
      throw new AuthorizationError("current CAN learner login required");
    await assertCurrentReviewedNativeLearner(native.account_id,native.person_id);
  }
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
 * when its active grant is Site Admin, Registrar or Room Facilitator, then independently
 * revalidate the same CAN session, immutable public Person, exact active grant,
 * Organization and Site through the restricted SQL reader. No native staff
 * Person, parallel grant or correspondence table is consulted.
 *
 * Other canonical roles retain their existing native session handling until
 * their separately reviewed identity/role mappings are supported. A broken
 * CAN session must never fall back to a native cookie or silently switch roles.
 */
export type ResolvedCanonicalCommandContext=CommandContext & {
  /** Present ONLY for a native learner bearer independently bound to the
   * current CAN Account and Person. Never derive this from a second read. */
  nativeLearningSessionId?:string;
};
export async function getCanonicalCommandContext(request: Request): Promise<ResolvedCanonicalCommandContext> {
  const hasCan = readCookie(request, accessSessionCookie) !== undefined;
  const hasNative = readCookie(request, canonicalSessionCookie) !== undefined;
  if (hasCan) {
    const actor = await getIdentityContext(request);
    if (actor.role === "room_facilitator" && hasNative) {
      // A second unrelated native bearer cannot coexist with an active CAN
      // facilitator membership during protected Class Session operations.
      throw new AuthorizationError("incompatible native facilitator session");
    }
    if (actor.role === "site_admin" || actor.role === "registrar" ||
        actor.role === "room_facilitator") {
      return resolveCanonicalSiteStaffFromCan(actor, request);
    }
    // CAN school students use their server-resolved active Person and exact
    // Site grant. Any permitted owner delegation is independently governed;
    // the effective Person still has to match active participation.
    // Course Attempt and Class Enrollment authorizers independently verify
    // Person, Site, Course and active participation on every request.
    if (actor.role === "student") {
      if (!studentSiteScope(actor)) {
        throw new AuthorizationError("current direct CAN student Site membership");
      }
      return actor;
    }
    // Direct CAN academic teachers may read ONLY explicitly assigned native
    // Classes. The Class workspace independently validates current exact
    // staff assignment, Course publication, Organization and Site on every
    // request. This is not a room-facilitator or grader authorization.
    if (actor.role === "teacher" && hasNative) {
      // A CAN academic teacher cannot silently inherit an unrelated native
      // learner or provider bearer. Resolve the conflicting session first.
      throw new AuthorizationError("incompatible native teacher session");
    }
    if (actor.role === "teacher" && actor.actorPersonId &&
        !actor.sessionAccountId && actor.grantSiteId &&
        actor.scope.siteIds?.length === 1 &&
        actor.scope.siteIds[0] === actor.grantSiteId &&
        actor.scope.organizationIds?.length === 1 &&
        actor.capabilities.has("teacher:read")) {
      return actor;
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
    await assertUnambiguousAdultAccount(actor.accountId,actor.actorPersonId);
    if(native.person_id!==actor.actorPersonId)
      throw new AuthorizationError("one authoritative CAN learner Person");
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
    return {...projectCanonicalCommandContext(native),nativeLearningSessionId:native.session_id};
  }
  // Legacy non-learner reviewers retain their separately scoped native
  // sessions until independent grant authority is fully migrated. Learners
  // may NEVER access a Course, Class or credential through a native bearer
  // alone: their sole sign-in is the verified public CAN account.
  const legacy = await getCanonicalSessionRow(request);
  if (legacy.role_code === "learner") {
    throw new AuthorizationError("current CAN learner login required");
  }
  return projectCanonicalCommandContext(legacy);
}
