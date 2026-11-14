import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, countDistinct, eq, exists, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  educationOperationSites, educationOperationOrganizationRoles,
  facilitatedLearningParticipants, facilitatedLearningPlayback, facilitatedLearningSessions,
  programDeployments, siteOrganizationRoles,
} from "@/db/canonical-v301";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";

const reportingWindowDays = 90;

/**
 * Only Site delivery is counted here. Official noncredit outcomes are obtained
 * separately from the existing canonical noncredit-pilot-outcomes read model;
 * neither should infer attendance from device pairing.
 */
export const getFacilitatedImpactReport = createServerFn({method:"GET"})
  .handler(async()=>{
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    const host=await requireCanonicalLabProvider();
    const now=new Date();
    const since=new Date(now.getTime()-reportingWindowDays*86400000);
    return db.transaction(async tx=>{
      const siteMembership=exists(tx.select({id:siteOrganizationRoles.id})
        .from(siteOrganizationRoles).where(and(
          eq(siteOrganizationRoles.siteId,facilitatedLearningSessions.siteId),
          eq(siteOrganizationRoles.organizationId,host.organizationId),
          inArray(siteOrganizationRoles.roleCode,["operator","host"]),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
        )));
      const activeOperationSite=exists(tx.select({id:educationOperationSites.id})
        .from(educationOperationSites)
        .innerJoin(programDeployments,eq(
          programDeployments.operationId,educationOperationSites.operationId,
        )).where(and(
          eq(programDeployments.id,facilitatedLearningSessions.deploymentId),
          eq(educationOperationSites.siteId,facilitatedLearningSessions.siteId),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
        )));
      const activeOperator=exists(tx.select({id:educationOperationOrganizationRoles.id})
        .from(educationOperationOrganizationRoles)
        .innerJoin(programDeployments,eq(
          programDeployments.operationId,educationOperationOrganizationRoles.operationId,
        )).where(and(
          eq(programDeployments.id,facilitatedLearningSessions.deploymentId),
          eq(educationOperationOrganizationRoles.organizationId,host.organizationId),
          eq(educationOperationOrganizationRoles.roleCode,"operator"),
          eq(educationOperationOrganizationRoles.status,"approved"),
          lte(educationOperationOrganizationRoles.validFrom,now),
          or(isNull(educationOperationOrganizationRoles.validThrough),
            gt(educationOperationOrganizationRoles.validThrough,now)),
        )));
      const roomScope=and(
        eq(facilitatedLearningSessions.hostOrganizationId,host.organizationId),
        inArray(facilitatedLearningSessions.siteId,host.siteIds),
        gt(facilitatedLearningSessions.startedAt,since),
        siteMembership,activeOperationSite,activeOperator,
      );
      const roomRows=await tx.select({
        id:facilitatedLearningSessions.id,
        deploymentId:facilitatedLearningSessions.deploymentId,
        siteId:facilitatedLearningSessions.siteId,
      }).from(facilitatedLearningSessions).where(roomScope).limit(5001);
      const partialSiteDelivery=roomRows.length>5000;
      const rooms=roomRows.slice(0,5000);
      const roomIds=rooms.map(row=>row.id);
      const joined=roomIds.length?await tx.select({
        sessionId:facilitatedLearningParticipants.facilitatedSessionId,
        uniqueLearners:countDistinct(facilitatedLearningParticipants.participantPersonId),
        uniqueAttempts:countDistinct(facilitatedLearningParticipants.courseAttemptId),
      }).from(facilitatedLearningParticipants)
        .where(inArray(facilitatedLearningParticipants.facilitatedSessionId,roomIds))
        .groupBy(facilitatedLearningParticipants.facilitatedSessionId):[];
      // Cross-room distinct counts are computed in the database, not summed per
      // room, because one participant can pair with several lessons/rooms.
      const sitePairs=roomIds.length?await tx.select({
        uniqueLearners:countDistinct(facilitatedLearningParticipants.participantPersonId),
        uniqueCourseAttempts:countDistinct(facilitatedLearningParticipants.courseAttemptId),
      }).from(facilitatedLearningParticipants)
        .where(inArray(facilitatedLearningParticipants.facilitatedSessionId,roomIds)):[];
      const plays=roomIds.length?await tx.select({
        sessionId:facilitatedLearningPlayback.facilitatedSessionId,
        played:countDistinct(facilitatedLearningPlayback.id),
      }).from(facilitatedLearningPlayback).where(and(
        inArray(facilitatedLearningPlayback.facilitatedSessionId,roomIds),
        eq(facilitatedLearningPlayback.kind,"played"),
      )).groupBy(facilitatedLearningPlayback.facilitatedSessionId):[];
      const perDeployment=new Map<string,{
        deploymentId:string;siteId:string;rooms:number;pairedDeviceSessions:number;
        playbackStarts:number;
      }>();
      for(const room of rooms) {
        const key=room.deploymentId+":"+room.siteId;
        const row=perDeployment.get(key)??{
          deploymentId:room.deploymentId,siteId:room.siteId,
          rooms:0,pairedDeviceSessions:0,playbackStarts:0,
        };
        row.rooms++;
        row.pairedDeviceSessions+=Number(joined.find(p=>p.sessionId===room.id)?.uniqueAttempts??0);
        row.playbackStarts+=Number(plays.find(p=>p.sessionId===room.id)?.played??0);
        perDeployment.set(key,row);
      }

      return {
        asOf:now.toISOString(),since:since.toISOString(),
        siteDelivery:{
          partial:partialSiteDelivery,
          roomCount:rooms.length,
          distinctPairedPeople:Number(sitePairs[0]?.uniqueLearners??0),
          distinctPairedCourseAttempts:Number(sitePairs[0]?.uniqueCourseAttempts??0),
          playbackStarts:plays.reduce((sum,row)=>sum+Number(row.played),0),
          byDeployment:[...perDeployment.values()],
        },
        limitations:[
          "Device pairing is not proof of site attendance or watched minutes.",
          "Reported provider outcomes may occur outside the hosted room.",
          "Site delivery totals are partial if more than 5,000 rooms are in the selected window.",
          "Final completion decisions, scores and verified feedback come from the existing noncredit pilot reporting service.",
        ],
      };
    });
  });
