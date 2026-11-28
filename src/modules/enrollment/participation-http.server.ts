import {AuthorizationError} from "@/domain/command-context";
import {parseCommandInput} from "@/domain/command-input";
import {z} from "zod";
import {joinNoncreditWaitlistService,cancelMyNoncreditWaitlistService,readMyNoncreditWaitlistPage,waitlistCursor} from "./noncredit-waitlist.server";
import {withdrawMyNoncreditRegistrationService} from "./noncredit-self-enrollment-withdraw.server";
const readInput=z.object({cursor:waitlistCursor.nullable(),releaseId:z.string().uuid().optional()}).strict();
export function participationWorkflow(request:Request,mode:string){
 const authorize=(method:"GET"|"POST")=>{
  if(request.method!==method||mode!=="can")throw new AuthorizationError("verified participation context");
 };
 return {
  joinNoncreditWaitlist:async(raw:unknown)=>{authorize("POST");return joinNoncreditWaitlistService(request,raw);},
  cancelMyNoncreditWaitlist:async(raw:unknown)=>{authorize("POST");return cancelMyNoncreditWaitlistService(request,raw);},
  getMyNoncreditWaitlistPage:async(raw:unknown)=>{authorize("GET");const input=parseCommandInput(readInput,raw);return readMyNoncreditWaitlistPage(request,input.cursor,input.releaseId);},
  withdrawMyNoncreditRegistration:async(raw:unknown)=>{authorize("POST");return withdrawMyNoncreditRegistrationService(request,raw);},
 };
}
