import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,lt,or,sql,inArray} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  accessAccountNoncreditPrincipals,
} from "@/db/schema";
import {
  noncreditEnrollmentWaitlist,
  noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,noncreditWaitlistEmailDeliveries,
} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import {AuthorizationError} from "@/domain/command-context";
import {requireNoncreditParticipantAccount,readNoncreditParticipantAccount,assertNoncreditParticipantRelease} from "./noncredit-self-enrollment-identity.server";
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
    const owner=await requireNoncreditParticipantAccount();
    return db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+data.releaseId}))`);
      const current=await readNoncreditParticipantAccount(owner.accountId,owner.personId,tx);
      const releases=await readEligibleSelfEnrollmentReleases(tx,data.releaseId);
      const release=releases[0];
      if(!release||release.consentVersion!==data.consentVersion||
        release.consentSha256!==data.consentSha256)
        throw new AuthorizationError("current published registration terms");
      assertNoncreditParticipantRelease(current,release);
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
      await writeCanonicalAudit(tx,{
        actorPersonId:null,owningOrganizationId:release.registeringOrganizationId,
        eventCode:"noncredit.waitlist.joined",
        entityKind:"noncredit_enrollment_waitlist",entityId:entryId,payload,
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"NoncreditWaitlistJoined",aggregateType:"noncredit_enrollment_waitlist",
        aggregateId:entryId,actorPersonId:null,payload,
      });
      return {status:"waiting" as const,alreadyQueued:false};
    });
  });

// Active invitation/waitlist opportunities use the original CAN account and
// original Person, regardless of the navigation role currently selected.
const waitlistCursor=z.object({
  joinedAt:z.string().datetime({offset:true}),
  waitlistId:z.string().uuid(),
}).strict();
async function readMyNoncreditWaitlistPage(
  cursor:z.infer<typeof waitlistCursor>|null,
  releaseId?:string,
){
  privateGuard();
  const owner=await requireNoncreditParticipantAccount();
  const rows=await db.select({
    waitlistId:noncreditEnrollmentWaitlist.id,
    releaseId:noncreditEnrollmentWaitlist.releaseId,
    status:noncreditEnrollmentWaitlist.status,
    inviteExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt,
    joinedAt:noncreditEnrollmentWaitlist.joinedAt,
    joinedAtCursor:sql<string>`to_char(${noncreditEnrollmentWaitlist.joinedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
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
      releaseId?eq(noncreditEnrollmentWaitlist.releaseId,releaseId):undefined,
      owner.demoScope?eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,owner.demoScope.organizationId):undefined,
      owner.demoScope?eq(noncreditSelfEnrollmentReleases.siteId,owner.demoScope.siteId):undefined,
      inArray(noncreditEnrollmentWaitlist.status,["waiting","invited"]),
      cursor?or(
        sql`${noncreditEnrollmentWaitlist.joinedAt} < ${cursor.joinedAt}::timestamptz`,
        and(sql`${noncreditEnrollmentWaitlist.joinedAt} = ${cursor.joinedAt}::timestamptz`,
          lt(noncreditEnrollmentWaitlist.id,cursor.waitlistId)),
      ):undefined,
    )).orderBy(desc(noncreditEnrollmentWaitlist.joinedAt),
      desc(noncreditEnrollmentWaitlist.id)).limit(51);
  const page=rows.slice(0,50);
  const last=page[page.length-1];
  const deliveries=page.length?await db.select({
    waitlistId:noncreditWaitlistEmailDeliveries.waitlistId,
    invitationExpiresAt:noncreditWaitlistEmailDeliveries.invitationExpiresAt,
    status:noncreditWaitlistEmailDeliveries.status,
    providerDeliveredAt:noncreditWaitlistEmailDeliveries.providerDeliveredAt,
    providerFailedAt:noncreditWaitlistEmailDeliveries.providerFailedAt,
  }).from(noncreditWaitlistEmailDeliveries)
    .where(inArray(noncreditWaitlistEmailDeliveries.waitlistId,
      page.map(row=>row.waitlistId))):[];
  return {
    items:page.map(row=>({
      releaseId:row.releaseId,title:row.title,
      emailDeliveryStatus:row.status==="invited"&&row.inviteExpiresAt
        ? (() => {
          const receipt=deliveries.find(item=>item.waitlistId===row.waitlistId&&
            item.invitationExpiresAt.getTime()===row.inviteExpiresAt!.getTime());
          return receipt?.providerFailedAt?"provider_failed"
            :receipt?.providerDeliveredAt?"provider_delivered"
            :receipt?.status==="accepted"?"provider_accepted"
            :receipt?.status??"not_queued";
        })()
        :null,
      status:row.status==="invited" && row.inviteExpiresAt &&
        row.inviteExpiresAt<=new Date()?"expired" as const:row.status,
      invitationActive:row.status==="invited"&&
        !!row.inviteExpiresAt&&row.inviteExpiresAt>new Date()&&
        row.releaseStatus==="published",
      inviteExpiresAt:row.inviteExpiresAt?.toISOString()??null,
      joinedAt:row.joinedAt.toISOString(),
    })),
    nextCursor:rows.length>50&&last
      ?{joinedAt:last.joinedAtCursor,waitlistId:last.waitlistId}:null,
  };
}
export const getMyNoncreditWaitlistPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    cursor:waitlistCursor.nullable().default(null),
  }).strict().parse(raw))
  .handler(async({data})=>readMyNoncreditWaitlistPage(data.cursor));

/** Exact authorized waiting-list record for the signed-in verified CAN Person.
 * The release ID narrows the existing ownership query, never supplies authority. */
export const getMyNoncreditWaitlistByRelease=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({releaseId:z.string().uuid()}).strict().parse(raw))
  .handler(async({data})=>{
    const page=await readMyNoncreditWaitlistPage(null,data.releaseId);
    return page.items[0]??null;
  });

/** Existing first-100 reader for the training management page. */
export const getMyNoncreditWaitlist=createServerFn({method:"GET"})
  .handler(async()=>{
    const first=await readMyNoncreditWaitlistPage(null);
    if(!first.nextCursor)return first.items;
    const second=await readMyNoncreditWaitlistPage(first.nextCursor);
    return [...first.items,...second.items];
  });

export const cancelMyNoncreditWaitlist=createServerFn({method:"POST"})
  .validator((v:unknown)=>cancelInput.parse(v))
  .handler(async({data})=>{
    privateGuard();
    const owner=await requireNoncreditParticipantAccount();
    return db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+data.releaseId}))`);
      const current=await readNoncreditParticipantAccount(owner.accountId,owner.personId,tx);
      if(current.demoScope){
        const [release]=await tx.select({registeringOrganizationId:noncreditSelfEnrollmentReleases.registeringOrganizationId,
          siteId:noncreditSelfEnrollmentReleases.siteId}).from(noncreditSelfEnrollmentReleases)
          .where(eq(noncreditSelfEnrollmentReleases.id,data.releaseId)).limit(1);
        if(!release)throw new AuthorizationError("own waitlist release");
        assertNoncreditParticipantRelease(current,release);
      }
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
      await writeCanonicalAudit(tx,{
        actorPersonId:null,
        eventCode:"noncredit.waitlist.cancelled",
        entityKind:"noncredit_enrollment_waitlist",entityId:entry.id,payload,
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"NoncreditWaitlistCancelled",
        aggregateType:"noncredit_enrollment_waitlist",aggregateId:entry.id,
        actorPersonId:null,payload,
      });
      return {cancelled:true,duplicate:false};
    });
  });
