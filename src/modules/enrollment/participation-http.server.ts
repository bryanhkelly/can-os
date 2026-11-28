import {AuthorizationError} from "@/domain/command-context";
import {parseCommandInput} from "@/domain/command-input";
import {z} from "zod";
import {joinNoncreditWaitlistService,cancelMyNoncreditWaitlistService,readMyNoncreditWaitlistPage,waitlistCursor} from "./noncredit-waitlist.server";
import {withdrawMyNoncreditRegistrationService} from "./noncredit-self-enrollment-withdraw.server";
import * as admissions from "./admissions-offer-http.server";
import {withdrawMyNativeClassEnrollmentService,cancelNativeClassEnrollmentService} from "@/modules/classes/native-class-lifecycle.server";
const readInput=z.object({cursor:waitlistCursor.nullable(),releaseId:z.string().uuid().optional()}).strict();
export function participationWorkflow(request:Request,mode:string){
 const authorize=(method:"GET"|"POST",expectedMode="can")=>{
  if(request.method!==method||mode!==expectedMode)throw new AuthorizationError("verified participation context");
 };
 return {
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
