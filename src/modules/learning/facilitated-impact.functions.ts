import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, countDistinct, eq, exists, gt, inArray, isNotNull, isNull, lte, not, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentExecutionAttempts, educationOperationSites,
  educationOperationOrganizationRoles,
  facilitatedLearningParticipants, facilitatedLearningPlayback, facilitatedLearningSessions,
  learnerCourseAttempts, noncreditCompletionDecisions, noncreditRegistrations,
  noncreditTrainingVersions, programDeployments, siteOrganizationRoles,
  surveyCampaigns, surveyResponses,
} from "@/db/canonical-v301";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";

const reportingWindowDays = 90;

/**
 * Site delivery is counted from actual rooms and distinct authenticated pairings.
 * It is not inferred attendance. Provider outcomes are separately counted from
 * canonical registration, assessment, survey and completion records.
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

      const trainings=await tx.select({
        id:noncreditTrainingVersions.id,title:noncreditTrainingVersions.title,
      }).from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.providerOrganizationId,host.organizationId))
        .limit(101);
      const capped=trainings.length>100;
      const selected=trainings.slice(0,100);
      const trainingIds=selected.map(row=>row.id);
      const registrations=trainingIds.length?await tx.select({
        trainingVersionId:noncreditRegistrations.trainingVersionId,
        status:noncreditRegistrations.status,
        participants:countDistinct(noncreditRegistrations.participantPersonId),
        registrations:countDistinct(noncreditRegistrations.id),
      }).from(noncreditRegistrations)
        .where(inArray(noncreditRegistrations.trainingVersionId,trainingIds))
        .groupBy(noncreditRegistrations.trainingVersionId,noncreditRegistrations.status):[];

      // Count completed decisions only if no later decision superseded them.
      const laterDecision=alias(noncreditCompletionDecisions,"facilitated_report_later_decision");
      const superseded=exists(tx.select({id:laterDecision.id})
        .from(laterDecision).where(eq(
          laterDecision.supersedesId,noncreditCompletionDecisions.id,
        )));
      const reportedCompletions=trainingIds.length?await tx.select({
        trainingVersionId:noncreditRegistrations.trainingVersionId,
        confirmed:countDistinct(noncreditCompletionDecisions.registrationId),
      }).from(noncreditCompletionDecisions)
        .innerJoin(noncreditRegistrations,eq(
          noncreditCompletionDecisions.registrationId,noncreditRegistrations.id,
        ))
        .where(and(
          inArray(noncreditRegistrations.trainingVersionId,trainingIds),
          eq(noncreditCompletionDecisions.outcome,"completed"),
          not(superseded),
        )).groupBy(noncreditRegistrations.trainingVersionId):[];

      const submitted=trainingIds.length?await tx.select({
        trainingVersionId:noncreditRegistrations.trainingVersionId,
        learners:countDistinct(learnerCourseAttempts.id),
      }).from(noncreditRegistrations)
        .innerJoin(learnerCourseAttempts,eq(
          learnerCourseAttempts.noncreditRegistrationId,noncreditRegistrations.id,
        ))
        .innerJoin(assessmentAccess,eq(
          assessmentAccess.courseAttemptId,learnerCourseAttempts.id,
        ))
        .innerJoin(assessmentExecutionAttempts,and(
          eq(assessmentExecutionAttempts.accessGrantId,assessmentAccess.id),
          isNotNull(assessmentExecutionAttempts.submittedAt),
        ))
        .where(inArray(noncreditRegistrations.trainingVersionId,trainingIds))
        .groupBy(noncreditRegistrations.trainingVersionId):[];

      const [surveyTotal]=await tx.select({
        responses:countDistinct(surveyResponses.id),
      }).from(surveyResponses)
        .innerJoin(surveyCampaigns,eq(
          surveyCampaigns.id,surveyResponses.campaignId,
        ))
        .where(and(eq(surveyCampaigns.operatingOrganizationId,host.organizationId),
          eq(surveyResponses.respondentMode,"identified")));

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
        organizationPrograms:{
          partial:capped,
          trainings:selected.map(training=>({
            ...training,
            registered:registrations.filter(row=>row.trainingVersionId===training.id)
              .reduce((sum,row)=>sum+Number(row.registrations),0),
            submittedKnowledgeCheck: Number(submitted.find(row=>
              row.trainingVersionId===training.id)?.learners??0),
            recordedCompletionDecisions: Number(reportedCompletions.find(row=>
              row.trainingVersionId===training.id)?.confirmed??0),
          })),
          identifiedSurveyResponses:Number(surveyTotal?.responses??0),
        },
        limitations:[
          "Device pairing is not proof of site attendance or watched minutes.",
          "Reported provider outcomes may occur outside the hosted room.",
          "Site delivery totals are partial if more than 5,000 rooms are in the selected window.",
          "Superseded completion decisions are excluded, but report publication still requires review of source records.",
        ],
      };
    });
  });
