import {completeNativeClassLesson,submitNativeClassHomeworkCommand} from "@/modules/classes/native-class-learner-write.server";
import {selectCurrentSessionMembership,recordCurrentSessionActivity} from "./session-lifecycle.server";
import { getInstructionalLearnerContext } from "./learning-command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { readNativeClassLearning, readNativeClassResume } from "@/modules/classes/native-class-learning-read.server";
import { readNativeClassHomework, readNativeClassHomeworkSummary, readNativeHomeworkHistory, readNativeHistoricalWork } from "@/modules/classes/native-class-homework-read.server";
import {createLaunchSiteService} from "@/modules/programs/launch-site-create.server";
import {submitNativeOfferingReleaseService,saveNativeOfferingReleasePolicyService,decideNativeOfferingReleaseService,publishNativeOfferingCoursesService,approveNativeOfferingAssetManifestService,publishNativeOfferingVersionService,getNativeOfferingReviewContentService,getNativeOfferingReleaseOverviewService,getNativeOfferingReleasePolicyReviewService,getNativeOfferingReleaseReviewQueueService} from "@/modules/learning/native-offering-release.server";
import {readWorkspaceSession} from "./workspace-session.server";
import { getIdentityContext } from "./command-context.server";
import { normalizeClientError } from "@/lib/client-error";
import { readStudentClasses } from "@/modules/classes/native-class-student-home.server";

import { listAvailableInstructionalTracks, selectInstructionalTrack, readSelectedInstructionalTrack, getSelectedInstructionalTrackAssetDownload, completeRecordedLesson, recordFormativePractice, readFormativePracticeHistory } from "@/modules/learning/student-instructional-tracks.server";
import type { z } from "zod";
import type { selectInstructionalTrackSchema, completeRecordedLessonSchema, recordFormativePracticeSchema } from "@/modules/learning/student-instructional-tracks.server";

/** Transport-neutral adapter. No new tokens, grant selectors, or demo privileges. */
export async function resolveHttpIdentity(request: Request) {
  const actor = await getIdentityContext(request);
  if (!actor.actorPersonId) throw new Error("Authenticated Person missing");
  const personId = actor.actorPersonId;
  async function learner() {
    const context = await getInstructionalLearnerContext(request);
    if (context.actorPersonId !== personId) throw new AuthorizationError("one verified learning Person");
    return context;
  }
  function requireWrite(){
    if(request.method!=="POST")throw new AuthorizationError("explicit mutation request");
  }
  return {
    me: {
      personId: actor.actorPersonId,
      grantId: actor.grantId,
      role: actor.role,
      organizationIds: actor.scope.organizationIds ?? [],
      siteIds: actor.scope.siteIds ?? [],
      programIds: actor.scope.programIds ?? [],
    },
    readReleaseContent:(input:unknown)=>{if(request.method!=="GET")throw new AuthorizationError("review read context");return getNativeOfferingReviewContentService(actor,input);},
    readReleaseOverview:(input:unknown)=>getNativeOfferingReleaseOverviewService(actor,input),
    readReleasePolicy:(input:unknown)=>getNativeOfferingReleasePolicyReviewService(actor,input),
    readReleaseQueue:(input:unknown)=>getNativeOfferingReleaseReviewQueueService(actor,input),
    createSite:async (input:unknown)=>{requireWrite();return createLaunchSiteService(actor,input);},
    submitRelease:async (input:unknown)=>{requireWrite();return submitNativeOfferingReleaseService(actor,input);},
    saveReleasePolicy:async (input:unknown)=>{requireWrite();return saveNativeOfferingReleasePolicyService(actor,input);},
    decideRelease:async (input:unknown)=>{requireWrite();return decideNativeOfferingReleaseService(actor,input);},
    publishCourses:async (input:unknown)=>{requireWrite();return publishNativeOfferingCoursesService(actor,input);},
    approveAssetManifest:async (input:unknown)=>{requireWrite();return approveNativeOfferingAssetManifestService(actor,input);},
    publishOffering:async (input:unknown)=>{requireWrite();return publishNativeOfferingVersionService(actor,input);},
    selectMembership:async (grantId:string)=>{requireWrite();await selectCurrentSessionMembership(actor,grantId);},
    recordActivity:async ()=>{requireWrite();await recordCurrentSessionActivity(actor);},
    completeLesson:async (classEnrollmentId:string,lessonId:string)=>{requireWrite();return completeNativeClassLesson(await learner(),{classEnrollmentId,lessonId});},
    submitHomework:async (classEnrollmentId:string,assignmentId:string,responseText:string)=>{requireWrite();return submitNativeClassHomeworkCommand(await learner(),{classEnrollmentId,assignmentId,responseText});},
    readSession:async ()=>{
      const session=await readWorkspaceSession(request);
      if(!session.authenticated)throw new AuthorizationError("current session");
      return {authenticated:true as const,activeGrantId:session.activeGrantId,role:session.role,
        grants:session.grants.map(({id,personId,role,organizationId,siteId})=>({id,personId,role,organizationId,siteId})),
        ...(session.ownerDelegation?{ownerDelegation:session.ownerDelegation}:{}),
      };
    },
    readStudentClasses: () => readStudentClasses(actor),
    readLearningWorkspace: async (id:string) => {
      const workspace=await readNativeClassLearning(await learner(),id);
      // Preserve RPC Date objects; HTTP uses explicit ISO timestamps.
      return {
        ...workspace,
        lessons:workspace.lessons.map(lesson=>({...lesson,observedAt:lesson.observedAt?.toISOString()??null})),
        outcomes:workspace.outcomes.map(outcome=>({...outcome,recordedAt:outcome.recordedAt.toISOString()})),
        awards:workspace.awards.map(award=>({...award,issuedAt:award.issuedAt.toISOString(),revokedAt:award.revokedAt?.toISOString()??null})),
      };
    },
    readLearningResume: async (id:string) => readNativeClassResume(await learner(),id),
    readHomeworkWorkspace: async (id:string) => readNativeClassHomework(await learner(),id),
    readHomeworkHistory: async (data:{classEnrollmentId:string;assignmentId:string;beforeRevision?:number})=>readNativeHomeworkHistory(await learner(),data),
    readHistoricalWork: async (data:{classEnrollmentId:string;beforeId?:string})=>readNativeHistoricalWork(await learner(),data),
    instruction: {
      choices: async (courseAttemptId:string)=>listAvailableInstructionalTracks(await learner(),{courseAttemptId}),
      selected: async (courseAttemptId:string)=>{
        const value=await readSelectedInstructionalTrack(await learner(),{courseAttemptId});
        return {...value,selection:{...value.selection,selectedAt:value.selection.selectedAt.toISOString()},
          lessons:value.lessons.map(lesson=>({...lesson,progress:lesson.progress?{...lesson.progress,observedAt:lesson.progress.observedAt.toISOString()}:null}))};
      },
      select: async (input:z.input<typeof selectInstructionalTrackSchema>)=>{requireWrite();return selectInstructionalTrack(await learner(),input);},
      download: async (input:{courseAttemptId:string;assetVersionId:string})=>{requireWrite();return getSelectedInstructionalTrackAssetDownload(await learner(),input);},
      complete: async (input:z.input<typeof completeRecordedLessonSchema>)=>{requireWrite();return completeRecordedLesson(await learner(),input);},
      practice: async (input:z.input<typeof recordFormativePracticeSchema>)=>{requireWrite();return recordFormativePractice(await learner(),input);},
      history: async (courseAttemptId:string)=>(await readFormativePracticeHistory(await learner(),{courseAttemptId})).map(row=>({...row,recordedAt:row.recordedAt.toISOString()})),
    },
    readHomeworkSummary: async (id:string) => readNativeClassHomeworkSummary(await learner(),id),
  };
}
export function classifyHttpDomainError(error: unknown) {
  // Raw schema errors are not presumed to be client faults. The caller
  // input boundary marks a VALIDATION_FAILED DomainError explicitly.
  // This also handles separate Zod installations across the Node bridge.
  if(error&&typeof error==="object"&&"name" in error&&error.name==="ZodError")return "unexpected";
  return normalizeClientError(error).kind;
}

export {handleAccessRequest,handleAccessVerification,handlePersonalRegistration,handleAccessLogout} from "./access-http.server";
export {handleSiteSignupRequest} from "./site-signup-http.server";

export {resolveGovernedWorkflow} from "./http-governed-workflows.server";
