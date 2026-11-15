import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccountNoncreditPrincipals } from "@/db/schema";
import { canonicalSessions, learnerCourseAttempts, noncreditRegistrations,
  noncreditSelfEnrollmentClaims } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getCanonicalSessionRow } from "@/modules/identity/canonical-command-context.server";

/**
 * Only real trusted user interaction may extend the native 30-minute idle
 * deadline. Loading the page, polling, playback progress or sending learning
 * evidence must not keep an unattended room logged in indefinitely.
 */
export const touchMyNoncreditLearningSession = createServerFn({method:"POST"})
  .validator((input:unknown)=>z.object({
    courseAttemptId:z.string().uuid(),
  }).strict().parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const { requireVerifiedAdultAccount } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    const canonical=await getCanonicalSessionRow(getRequest());
    if(canonical.role_code!=="learner"||canonical.site_id!==null)
      throw new AuthorizationError("native learner session");
    const [link]=await db.select().from(accessAccountNoncreditPrincipals)
      .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
    if(!link || link.accessPersonId!==owner.personId ||
      link.canonicalAccountId!==canonical.account_id ||
      link.canonicalPersonId!==canonical.person_id)
      throw new AuthorizationError("linked current native Person");

    const [owned]=await db.select({id:learnerCourseAttempts.id})
      .from(learnerCourseAttempts)
      .innerJoin(noncreditRegistrations,and(
        eq(noncreditRegistrations.id,learnerCourseAttempts.noncreditRegistrationId),
        eq(noncreditRegistrations.deploymentId,learnerCourseAttempts.deploymentId),
        eq(noncreditRegistrations.participantPersonId,canonical.person_id),
      ))
      .innerJoin(noncreditSelfEnrollmentClaims,and(
        eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id),
        eq(noncreditSelfEnrollmentClaims.canonicalAccountId,canonical.account_id),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,canonical.person_id),
      ))
      .where(and(
        eq(learnerCourseAttempts.id,data.courseAttemptId),
        eq(learnerCourseAttempts.status,"active"),
      )).limit(1);
    if(!owned)throw new AuthorizationError("current learner course attempt");
    const now=new Date();
    await db.update(canonicalSessions).set({lastActivityAt:now})
      .where(and(
        eq(canonicalSessions.id,canonical.session_id),
        eq(canonicalSessions.accountId,canonical.account_id),
        eq(canonicalSessions.activeGrantId,canonical.grant_id),
        isNull(canonicalSessions.revokedAt),
        gt(canonicalSessions.expiresAt,now),
        // Server-side throttle; the caller's 60s throttle is not authority.
        lt(canonicalSessions.lastActivityAt,new Date(now.getTime()-60_000)),
        gt(canonicalSessions.lastActivityAt,new Date(now.getTime()-30*60_000)),
      ));
    return {ok:true};
  });
