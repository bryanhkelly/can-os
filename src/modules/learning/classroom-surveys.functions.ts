import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, evidenceDocumentVersions,
  facilitatedLearningParticipants, facilitatedLearningSessions,
  facilitatedRoomSurveyCampaigns, surveyCampaigns, surveyDefinitions,
  surveyInvitations, surveyResponses, surveyVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { attemptInAssignedClassroomRelease } from "./classroom-release-boundary.server";
import { classroomFeedbackOpen } from "@/domain/classroom-feedback";
import { facilitatedRoomOperationalState } from "@/domain/facilitated-learning";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { ownedRoom, roomHostIsCurrent } from "./facilitated-learning.functions";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const id=z.string().uuid();
const roomInput=z.object({facilitatedSessionId:id}).strict();
const learnerInput=roomInput.extend({courseAttemptId:id}).strict();
const attachInput=roomInput.extend({
  surveyCampaignId:id,stage:z.enum(["entry","pulse","exit"]),
}).strict();
function guard(){
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function approvedCampaign(tx:Tx,organizationId:string,deploymentId:string,campaignId:string){
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const [row]=await tx.select({
    campaign:surveyCampaigns,
    title:surveyDefinitions.title,
    audience:surveyDefinitions.intendedAudience,
    permission:evidenceDocumentVersions,
  }).from(surveyCampaigns)
    .innerJoin(surveyVersions,and(
      eq(surveyVersions.id,surveyCampaigns.surveyVersionId),
      eq(surveyVersions.lifecycle,"published"),
    ))
    .innerJoin(surveyDefinitions,and(
      eq(surveyDefinitions.id,surveyVersions.surveyId),
      eq(surveyDefinitions.status,"active"),
    ))
    .innerJoin(evidenceDocumentVersions,
      eq(evidenceDocumentVersions.id,surveyCampaigns.surveyPermissionEvidenceId))
    .where(and(
      eq(surveyCampaigns.id,campaignId),
      eq(surveyCampaigns.operatingOrganizationId,organizationId),
      eq(surveyCampaigns.deploymentId,deploymentId),
      eq(surveyCampaigns.status,"active"),
      eq(surveyCampaigns.responseMode,"identified"),
      lte(surveyCampaigns.startsAt,now),
      or(isNull(surveyCampaigns.endsAt),gt(surveyCampaigns.endsAt,now)),
      isNotNull(evidenceDocumentVersions.verifiedAt),
      isNotNull(evidenceDocumentVersions.verifiedByPersonId),
      lte(evidenceDocumentVersions.verifiedAt,now),
    )).limit(1);
  if(!row || !["learner","any"].includes(row.audience) ||
    (row.permission.validFrom && row.permission.validFrom>today) ||
    (row.permission.validThrough && row.permission.validThrough<today))
    throw new AuthorizationError("active governed identified learner survey with verified permission");
  return {id:row.campaign.id,title:row.title};
}
/** Only prepared and approved personally invited campaigns are linkable.
 * The facilitator never edits or reads survey responses in the room API. */
export const getClassroomSurveyOptions=createServerFn({method:"GET"})
  .validator((raw:unknown)=>roomInput.parse(raw))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      const rows=await tx.select({id:surveyCampaigns.id})
        .from(surveyCampaigns).where(and(
          eq(surveyCampaigns.operatingOrganizationId,host.organizationId),
          eq(surveyCampaigns.deploymentId,room.deploymentId),
          eq(surveyCampaigns.status,"active"),
          eq(surveyCampaigns.responseMode,"identified"),
        )).orderBy(asc(surveyCampaigns.startsAt)).limit(101);
      const options=[];
      for(const candidate of rows.slice(0,100)){
        try{options.push(await approvedCampaign(
          tx,host.organizationId,room.deploymentId,candidate.id,
        ));}catch(error){
          if(!(error instanceof AuthorizationError))throw error;
        }
      }
      if(!await attemptInAssignedClassroomRelease(
        tx,room,access.courseAttemptId,personId,
      ))throw new AuthorizationError("own classroom enrollment release");
      const links=await tx.select({
        surveyCampaignId:facilitatedRoomSurveyCampaigns.surveyCampaignId,
        stage:facilitatedRoomSurveyCampaigns.stage,
      }).from(facilitatedRoomSurveyCampaigns)
        .where(eq(facilitatedRoomSurveyCampaigns.facilitatedSessionId,room.id))
        .limit(101);
      return {campaigns:options,links:links.slice(0,100),partial:rows.length>100||links.length>100,
        notice:"Campaigns require existing published surveys, verified permission, personal invitations and active consent. No raw responses are visible here."};
    });
  });
export const attachClassroomSurvey=createServerFn({method:"POST"})
  .validator((raw:unknown)=>attachInput.parse(raw))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      if(!classroomFeedbackOpen(room,new Date()))
        throw new AuthorizationError("recent classroom survey linkage window");
      await approvedCampaign(tx,host.organizationId,room.deploymentId,data.surveyCampaignId);
      const [saved]=await tx.insert(facilitatedRoomSurveyCampaigns).values({
        facilitatedSessionId:room.id,surveyCampaignId:data.surveyCampaignId,
        stage:data.stage,linkedByPersonId:host.actor.actorPersonId!,
      }).onConflictDoNothing().returning({
        id:facilitatedRoomSurveyCampaigns.surveyCampaignId,
      });
      if(saved){
        const payload={facilitatedSessionId:room.id,
          surveyCampaignId:data.surveyCampaignId,stage:data.stage};
        await tx.insert(auditEvents).values({
          actorPersonId:host.actor.actorPersonId!,
          owningOrganizationId:host.organizationId,
          eventCode:"learning.classroom.survey.attached",
          entityKind:"facilitated_learning_session",
          entityId:room.id,payload,
        });
        await tx.insert(domainEvents).values({
          actorPersonId:host.actor.actorPersonId!,
          eventType:"ClassroomSurveyAttached",aggregateType:"facilitated_learning_session",
          aggregateId:room.id,payload,
        });
      }
      return {linked:true,duplicate:!saved,
        note:"Existing personally invited learners submit through the governed survey service; no confidential responses were copied."};
    });
  });

/** Never enumerate a room's survey invitations to other learners. Classroom
 * quick ratings and governed surveys are separate; anonymous/confidential
 * modes are excluded here and require their own consent-preserving flows. */
export const getClassroomLearnerSurveys=createServerFn({method:"GET"})
  .validator((raw:unknown)=>learnerInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(actor.role!=="learner"||!actor.actorPersonId)
      throw new AuthorizationError("identified noncredit learner survey");
    const personId = actor.actorPersonId;
    return db.transaction(async tx=>{
      const access=await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId,true);
      if(access.source!=="noncredit")
        throw new AuthorizationError("governed noncredit Course survey");
      const [pair]=await tx.select({
        id:facilitatedLearningParticipants.id,
        leftAt:facilitatedLearningParticipants.leftAt,
      }).from(facilitatedLearningParticipants)
        .where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId,data.facilitatedSessionId),
          eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId,personId),
        )).limit(1);
      const [room]=await tx.select().from(facilitatedLearningSessions)
        .where(eq(facilitatedLearningSessions.id,data.facilitatedSessionId)).limit(1);
      if(!pair||!room||room.deploymentId!==access.deploymentId ||
        room.courseVersionId!==access.courseVersionId ||
        !await roomHostIsCurrent(tx,room,new Date()))
        throw new AuthorizationError("own registered classroom survey");
      const links=await tx.select({
        id:facilitatedRoomSurveyCampaigns.surveyCampaignId,
        stage:facilitatedRoomSurveyCampaigns.stage,
      }).from(facilitatedRoomSurveyCampaigns)
        .where(eq(facilitatedRoomSurveyCampaigns.facilitatedSessionId,room.id))
        .limit(30);
      const results=[];
      for(const link of links){
        const roomState=facilitatedRoomOperationalState(room,new Date());
        // Exit surveys appear only after an actual leave or room closure.
        // Pulse surveys are available only during the active classroom.
        if(link.stage==="exit"&&roomState==="live"&&!pair.leftAt)continue;
        if(link.stage==="pulse"&&roomState!=="live")continue;
        try{
          const approved=await approvedCampaign(tx,room.hostOrganizationId,
            room.deploymentId,link.id);
          const now=new Date();
          const [invitation]=await tx.select({id:surveyInvitations.id})
            .from(surveyInvitations).where(and(
              eq(surveyInvitations.campaignId,link.id),
              eq(surveyInvitations.invitedPersonId,personId),
              lte(surveyInvitations.sentAt,now),
              or(isNull(surveyInvitations.dueAt),gt(surveyInvitations.dueAt,now)),
            )).limit(1);
          if(!invitation)continue;
          const [submitted]=await tx.select({id:surveyResponses.id})
            .from(surveyResponses)
            .where(eq(surveyResponses.invitationId,invitation.id)).limit(1);
          results.push({campaignId:approved.id,title:approved.title,stage:link.stage,
            submitted:!!submitted});
        }catch(error){
          if(!(error instanceof AuthorizationError))throw error;
        }
      }
      return {surveys:results,
        notice:"These are separately approved identified surveys. Survey answers never appear in the classroom feed or facilitator console."};
    });
  });
