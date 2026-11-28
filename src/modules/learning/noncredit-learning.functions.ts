import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getLearnerCourseParticipationKindService,participationKindInput} from "./noncredit-learning.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const getLearnerCourseParticipationKind=createServerFn({method:"GET"}).validator((raw:unknown)=>participationKindInput.parse(raw)).handler(async({data})=>{noStore();return getLearnerCourseParticipationKindService(getRequest(),data);});
