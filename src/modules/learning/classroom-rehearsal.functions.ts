import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { getClassroomRehearsalChoicesService, getClassroomRehearsalMediaService, getClassroomRehearsalMediaAccessService, recordClassroomRehearsalPlaybackService, rehearsalInput, mediaInput, playbackInput } from "./classroom-rehearsal.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const getClassroomRehearsalChoices=createServerFn({method:"GET"}).handler(async()=>{noStore();return getClassroomRehearsalChoicesService(getRequest());});
export const getClassroomRehearsalMedia=createServerFn({method:"GET"}).validator((raw:unknown)=>rehearsalInput.parse(raw)).handler(async({data})=>{noStore();return getClassroomRehearsalMediaService(getRequest(),data);});
export const getClassroomRehearsalMediaAccess=createServerFn({method:"POST"}).validator((raw:unknown)=>mediaInput.parse(raw)).handler(async({data})=>{noStore();return getClassroomRehearsalMediaAccessService(getRequest(),data);});
export const recordClassroomRehearsalPlayback=createServerFn({method:"POST"}).validator((raw:unknown)=>playbackInput.parse(raw)).handler(async({data})=>{noStore();return recordClassroomRehearsalPlaybackService(getRequest(),data);});
