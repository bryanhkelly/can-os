import {completeNativeClassLesson,submitNativeClassHomeworkCommand} from "@/modules/classes/native-class-learner-write.server";
import {selectCurrentSessionMembership,recordCurrentSessionActivity} from "./session-lifecycle.server";
import { getInstructionalLearnerContext } from "./learning-command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { readNativeClassResume } from "@/modules/classes/native-class-learning-read.server";
import { readNativeClassHomeworkSummary } from "@/modules/classes/native-class-homework-read.server";
import {createLaunchSiteService} from "@/modules/programs/launch-site-create.server";
import {submitNativeOfferingReleaseService,saveNativeOfferingReleasePolicyService,decideNativeOfferingReleaseService,publishNativeOfferingCoursesService,approveNativeOfferingAssetManifestService,publishNativeOfferingVersionService,getNativeOfferingReleaseOverviewService,getNativeOfferingReleasePolicyReviewService,getNativeOfferingReleaseReviewQueueService} from "@/modules/learning/native-offering-release.server";
import { getIdentityContext } from "./command-context.server";
import { normalizeClientError } from "@/lib/client-error";
import { readStudentClasses } from "@/modules/classes/native-class-student-home.server";

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
    readStudentClasses: () => readStudentClasses(actor),
    readLearningResume: async (id:string) => readNativeClassResume(await learner(),id),
    readHomeworkSummary: async (id:string) => readNativeClassHomeworkSummary(await learner(),id),
  };
}
export function classifyHttpDomainError(error: unknown) {
  return normalizeClientError(error).kind;
}
