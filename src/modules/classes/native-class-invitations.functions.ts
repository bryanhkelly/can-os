import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {issueNativeClassInvitationService,issueInput,getMyNativeClassInvitationsService,declineNativeClassInvitationService,respondInput} from "./native-class-invitations.server";
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const issueNativeClassInvitation=createServerFn({method:"POST"}).validator((raw:unknown)=>issueInput.parse(raw)).handler(async({data})=>{
 privateResponse();return issueNativeClassInvitationService(getRequest(),data);
});
export const getMyNativeClassInvitations=createServerFn({method:"GET"}).handler(async()=>{
 privateResponse();return getMyNativeClassInvitationsService(getRequest());
});
export const declineNativeClassInvitation=createServerFn({method:"POST"}).validator((raw:unknown)=>respondInput.parse(raw)).handler(async({data})=>{
 privateResponse();return declineNativeClassInvitationService(getRequest(),data);
});
