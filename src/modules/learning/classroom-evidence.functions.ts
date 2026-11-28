import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getClassroomLearnerActivitiesService,getClassroomLearnerActivitiesInputSchema,releaseClassroomActivityService,releaseClassroomActivityInputSchema,closeClassroomActivityService,closeClassroomActivityInputSchema,submitClassroomResponseService,submitClassroomResponseInputSchema,recordClassroomPresenceService,recordClassroomPresenceInputSchema,getClassroomHostActivityService,getClassroomHostActivityInputSchema,getClassroomPresentationStateService,getClassroomPresentationStateInputSchema} from "./classroom-evidence.server";
export const getClassroomLearnerActivities=createServerFn({method:"GET"}).validator((raw:unknown)=>getClassroomLearnerActivitiesInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomLearnerActivitiesService(getRequest(),data);
});
export const releaseClassroomActivity=createServerFn({method:"POST"}).validator((raw:unknown)=>releaseClassroomActivityInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return releaseClassroomActivityService(getRequest(),data);
});
export const closeClassroomActivity=createServerFn({method:"POST"}).validator((raw:unknown)=>closeClassroomActivityInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return closeClassroomActivityService(getRequest(),data);
});
export const submitClassroomResponse=createServerFn({method:"POST"}).validator((raw:unknown)=>submitClassroomResponseInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return submitClassroomResponseService(getRequest(),data);
});
export const recordClassroomPresence=createServerFn({method:"POST"}).validator((raw:unknown)=>recordClassroomPresenceInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return recordClassroomPresenceService(getRequest(),data);
});
export const getClassroomHostActivity=createServerFn({method:"GET"}).validator((raw:unknown)=>getClassroomHostActivityInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomHostActivityService(getRequest(),data);
});
export const getClassroomPresentationState=createServerFn({method:"GET"}).validator((raw:unknown)=>getClassroomPresentationStateInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomPresentationStateService(getRequest(),data);
});
