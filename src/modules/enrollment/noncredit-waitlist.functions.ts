import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,eq,sql,inArray} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  accessAccountNoncreditPrincipals,
} from "@/db/schema";
import {
  auditEvents,domainEvents,noncreditEnrollmentWaitlist,
  noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {noncreditEnrollCommand} from "@/domain/noncredit-self-enrollment";
import {readEligibleSelfEnrollmentReleases} from "./noncredit-self-enrollment-catalog.server";

const waitlistInput=noncreditEnrollCommand.pick({
  releaseId:true,consentVersion:true,consentSha256:true,
  acceptedConsent:true,adultConfirmed:true,
}).strict();
const cancelInput=z.object({releaseId:z.string().uuid()}).strict();
function privateGuard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

/** No native learner grant or Course attempt is created by waitlisting.
 * An applicant must have a verified independent adult CAN identity. */
export const joinNoncreditWaitlist=createServerFn({method:"POST"})
  .validator((v:unknown)=>waitlistInput.parse(v))
  .handler(async({data})=>{
    privateGuard();
    const { requireVerifiedAdultAccount } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    return db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+data.releaseId}))`);
      const releases=await readEligibleSelfEnrollmentReleases(tx,data.releaseId);
      const release=releases[0];
      if(!release||release.consentVersion!==data.consentVersion||
        release.consentSha256!==data.consentSha256)
        throw new AuthorizationError("current published registration terms");
      if(release.seatsRemaining>0&&!release.hasWaitingQueue)
        throw new AuthorizationError("registration is open; enroll directly instead");
      const [linked]=await tx.select({
        nativeAccountId:accessAccountNoncreditPrincipals.canonicalAccountId,
      }).from(accessAccountNoncreditPrincipals)
        .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
      if(linked){
        const [claim]=await tx.select({id:noncreditSelfEnrollmentClaims.id})
          .from(noncreditSelfEnrollmentClaims).where(and(
            eq(noncreditSelfEnrollmentClaims.releaseId,release.id),
            eq(noncreditSelfEnrollmentClaims.canonicalAccountId,linked.nativeAccountId),
          )).limit(1);
        if(claim)throw new AuthorizationError("registration already exists for this training release");
      }
      const [prior]=await tx.select().from(noncreditEnrollmentWaitlist).where(and(
        eq(noncreditEnrollmentWaitlist.releaseId,release.id),
        eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId),
      )).limit(1).for("update");
      if(prior && prior.accessPersonId!==owner.personId)
        throw new AuthorizationError("waitlist identity requires operator reconciliation");
      if(prior?.status==="accepted")
        throw new AuthorizationError("already enrolled through this waitlist");
      if(prior?.status==="waiting"||
        (prior?.status==="invited"&&prior.inviteExpiresAt&&prior.inviteExpiresAt>new Date()))
        return {status:prior.status,alreadyQueued:true};
      const now=new Date();
      let entryId:string;
      if(prior){
        await tx.update(noncreditEnrollmentWaitlist).set({
          status:"waiting",joinedAt:now,updatedAt:now,
          invitedAt:null,inviteExpiresAt:null,
          consentVersion:data.consentVersion,consentSha256:data.consentSha256,
        }).where(eq(noncreditEnrollmentWaitlist.id,prior.id));
        entryId=prior.id;
      }else{
        const [created]=await tx.insert(noncreditEnrollmentWaitlist).values({
          releaseId:release.id,accessAccountId:owner.accountId,
          accessPersonId:owner.personId,
          consentVersion:data.consentVersion,
          consentSha256:data.consentSha256,adultAttested:true,
        }).returning({id:noncreditEnrollmentWaitlist.id});
        if(!created)throw new Error("Could not save waitlist entry");
        entryId=created.id;
      }
      const payload={releaseId:release.id,accessAccountId:owner.accountId};
      await tx.insert(auditEvents).values({
        actorPersonId:null,owningOrganizationId:release.registeringOrganizationId,
        eventCode:"noncredit.waitlist.joined",
        entityKind:"noncredit_enrollment_waitlist",entityId:entryId,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditWaitlistJoined",aggregateType:"noncredit_enrollment_waitlist",
        aggregateId:entryId,actorPersonId:null,payload,
      });
      return {status:"waiting" as const,alreadyQueued:false};
    });
  });

export const getMyNoncreditWaitlist=createServerFn({method:"GET"})
  .handler(async()=>{
    privateGuard();
    const { requireVerifiedAdultAccount } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    const rows=await db.select({
      releaseId:noncreditEnrollmentWaitlist.releaseId,
      status:noncreditEnrollmentWaitlist.status,
      inviteExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt,
      joinedAt:noncreditEnrollmentWaitlist.joinedAt,
      title:noncreditTrainingVersions.title,
      releaseStatus:noncreditSelfEnrollmentReleases.status,
    }).from(noncreditEnrollmentWaitlist)
      .innerJoin(noncreditSelfEnrollmentReleases,eq(
        noncreditSelfEnrollmentReleases.id,noncreditEnrollmentWaitlist.releaseId))
      .innerJoin(noncreditTrainingVersions,eq(
        noncreditTrainingVersions.id,noncreditSelfEnrollmentReleases.trainingVersionId))
      .where(and(
        eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId),
        eq(noncreditEnrollmentWaitlist.accessPersonId,owner.personId),
        inArray(noncreditEnrollmentWaitlist.status,["waiting","invited"]),
      )).limit(100);
    return rows.map(row=>({
      releaseId:row.releaseId,title:row.title,
      status:row.status==="invited" && row.inviteExpiresAt &&
        row.inviteExpiresAt<=new Date()?"expired" as const:row.status,
      invitationActive:row.status==="invited"&&
        !!row.inviteExpiresAt&&row.inviteExpiresAt>new Date()&&
        row.releaseStatus==="published",
      inviteExpiresAt:row.inviteExpiresAt?.toISOString()??null,
      joinedAt:row.joinedAt.toISOString(),
    }));
  });

export const cancelMyNoncreditWaitlist=createServerFn({method:"POST"})
  .validator((v:unknown)=>cancelInput.parse(v))
  .handler(async({data})=>{
    privateGuard();
    const { requireVerifiedAdultAccount } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    return db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+data.releaseId}))`);
      const [entry]=await tx.select().from(noncreditEnrollmentWaitlist).where(and(
        eq(noncreditEnrollmentWaitlist.releaseId,data.releaseId),
        eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId),
        eq(noncreditEnrollmentWaitlist.accessPersonId,owner.personId),
      )).limit(1).for("update");
      if(!entry)throw new AuthorizationError("own waitlist entry");
      if(entry.status==="accepted")throw new AuthorizationError("enrollment must be withdrawn separately");
      if(entry.status==="cancelled")return {cancelled:true,duplicate:true};
      await tx.update(noncreditEnrollmentWaitlist).set({
        status:"cancelled",updatedAt:new Date(),
      }).where(eq(noncreditEnrollmentWaitlist.id,entry.id));
      const payload={releaseId:data.releaseId,accessAccountId:owner.accountId};
      await tx.insert(auditEvents).values({
        actorPersonId:null,
        eventCode:"noncredit.waitlist.cancelled",
        entityKind:"noncredit_enrollment_waitlist",entityId:entry.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditWaitlistCancelled",
        aggregateType:"noncredit_enrollment_waitlist",aggregateId:entry.id,
        actorPersonId:null,payload,
      });
      return {cancelled:true,duplicate:false};
    });
  });
