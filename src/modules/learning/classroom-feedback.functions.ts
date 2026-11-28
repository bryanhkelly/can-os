import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getRecentClassroomFeedbackService,historyInput,submitClassroomFeedbackService,feedbackInput} from "./classroom-feedback.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const getRecentClassroomFeedback=createServerFn({method:"GET"}).validator((raw:unknown)=>historyInput.parse(raw)).handler(async({data})=>{noStore();return getRecentClassroomFeedbackService(getRequest(),data);});
export const submitClassroomFeedback=createServerFn({method:"POST"}).validator((raw:unknown)=>feedbackInput.parse(raw)).handler(async({data})=>{noStore();return submitClassroomFeedbackService(getRequest(),data);});
