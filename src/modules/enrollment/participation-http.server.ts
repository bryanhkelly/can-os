import {AuthorizationError} from "@/domain/command-context";
import {parseCommandInput} from "@/domain/command-input";
import {z} from "zod";
import {joinNoncreditWaitlistService,cancelMyNoncreditWaitlistService,readMyNoncreditWaitlistPage,waitlistCursor} from "./noncredit-waitlist.server";
import {withdrawMyNoncreditRegistrationService} from "./noncredit-self-enrollment-withdraw.server";
import * as admissions from "./admissions-offer-http.server";
import {withdrawMyNativeClassEnrollmentService,cancelNativeClassEnrollmentService} from "@/modules/classes/native-class-lifecycle.server";
import * as approvals from "@/modules/classes/native-class-approvals.server";
import * as invitations from "@/modules/classes/native-class-invitations.server";
import * as assignment from "@/modules/classes/native-class-assignment.server";
const readInput=z.object({cursor:waitlistCursor.nullable(),releaseId:z.string().uuid().optional()}).strict();
export function participationWorkflow(request:Request,mode:string){
 const authorize=(method:"GET"|"POST",expectedMode="can")=>{
  if(request.method!==method||mode!==expectedMode)throw new AuthorizationError("verified participation context");
 };
 return {
  requestNativeClassApproval:async(raw:unknown)=>{authorize("POST","canonical");return approvals.requestNativeClassApprovalService(request,parseCommandInput(approvals.requestInput,raw));},
  decideNativeClassApproval:async(raw:unknown)=>{authorize("POST","canonical");return approvals.decideNativeClassApprovalService(request,parseCommandInput(approvals.decisionInput,raw));},
  getMyNativeClassApprovals:async(raw:unknown)=>{authorize("GET","canonical");parseCommandInput(z.object({}).strict(),raw);return approvals.getMyNativeClassApprovalsService(request);},
  getNativeClassApprovalQueue:async(raw:unknown)=>{authorize("GET","canonical");return approvals.getNativeClassApprovalQueueService(request,parseCommandInput(approvals.queueInput,raw));},
  issueNativeClassInvitation:async(raw:unknown)=>{authorize("POST","canonical");return invitations.issueNativeClassInvitationService(request,parseCommandInput(invitations.issueInput,raw));},
  getMyNativeClassInvitations:async(raw:unknown)=>{authorize("GET","canonical");parseCommandInput(z.object({}).strict(),raw);return invitations.getMyNativeClassInvitationsService(request);},
  declineNativeClassInvitation:async(raw:unknown)=>{authorize("POST","canonical");return invitations.declineNativeClassInvitationService(request,parseCommandInput(invitations.respondInput,raw));},
  assignAdultToNativeClass:async(raw:unknown)=>{authorize("POST","canonical");return assignment.assignAdultToNativeClassService(request,parseCommandInput(assignment.assignSchema,raw));},
  getAdmissionOfferOptions:async(raw:unknown)=>{authorize("GET");return admissions.getAdmissionOfferOptionsService(request,parseCommandInput(admissions.getAdmissionOfferOptionsInput,raw));},
  issueAdmissionOffer:async(raw:unknown)=>{authorize("POST");return admissions.issueAdmissionOfferService(request,parseCommandInput(admissions.issueAdmissionOfferInput,raw));},
  respondToAdmissionOffer:async(raw:unknown)=>{authorize("POST");return admissions.respondToAdmissionOfferService(request,parseCommandInput(admissions.respondToAdmissionOfferInput,raw));},
  activateOfferedEnrollment:async(raw:unknown)=>{authorize("POST");return admissions.activateOfferedEnrollmentService(request,parseCommandInput(admissions.activateOfferedEnrollmentInput,raw));},
  withdrawIssuedAdmissionOffer:async(raw:unknown)=>{authorize("POST");return admissions.withdrawIssuedAdmissionOfferService(request,parseCommandInput(admissions.withdrawIssuedAdmissionOfferInput,raw));},
  withdrawMyNativeClassEnrollment:async(raw:unknown)=>{authorize("POST","canonical");return withdrawMyNativeClassEnrollmentService(request,raw);},
  cancelNativeClassEnrollment:async(raw:unknown)=>{authorize("POST","canonical");return cancelNativeClassEnrollmentService(request,raw);},
  joinNoncreditWaitlist:async(raw:unknown)=>{authorize("POST");return joinNoncreditWaitlistService(request,raw);},
  cancelMyNoncreditWaitlist:async(raw:unknown)=>{authorize("POST");return cancelMyNoncreditWaitlistService(request,raw);},
  getMyNoncreditWaitlistPage:async(raw:unknown)=>{authorize("GET");const input=parseCommandInput(readInput,raw);return readMyNoncreditWaitlistPage(request,input.cursor,input.releaseId);},
  withdrawMyNoncreditRegistration:async(raw:unknown)=>{authorize("POST");return withdrawMyNoncreditRegistrationService(request,raw);},
 };
}
