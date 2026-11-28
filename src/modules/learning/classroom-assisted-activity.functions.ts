import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {recordClassroomAssistedActivityService,assistedActivityInput} from "./classroom-assisted-activity.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const recordClassroomAssistedActivity=createServerFn({method:"POST"}).validator((raw:unknown)=>assistedActivityInput.parse(raw)).handler(async({data})=>{noStore();return recordClassroomAssistedActivityService(getRequest(),data);});
