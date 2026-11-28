import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getFacilitatedRoomMediaService,getFacilitatedRoomMediaInputSchema,getFacilitatedRoomMediaAccessService,getFacilitatedRoomMediaAccessInputSchema,getFacilitatedHostWorkspaceService,startFacilitatedLearningRoomService,startFacilitatedLearningRoomInputSchema,renewFacilitatedLearningPairingService,renewFacilitatedLearningPairingInputSchema,endFacilitatedLearningRoomService,endFacilitatedLearningRoomInputSchema,recordFacilitatedPlaybackService,recordFacilitatedPlaybackInputSchema,pairWithFacilitatedRoomService,pairWithFacilitatedRoomInputSchema,leaveFacilitatedRoomService,leaveFacilitatedRoomInputSchema,getLearnerFacilitatedRoomService,getLearnerFacilitatedRoomInputSchema} from "./facilitated-learning.server";
export const getFacilitatedRoomMedia=createServerFn({method:"GET"}).validator((raw:unknown)=>getFacilitatedRoomMediaInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getFacilitatedRoomMediaService(getRequest(),data);
});
export const getFacilitatedRoomMediaAccess=createServerFn({method:"POST"}).validator((raw:unknown)=>getFacilitatedRoomMediaAccessInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getFacilitatedRoomMediaAccessService(getRequest(),data);
});
export const getFacilitatedHostWorkspace=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getFacilitatedHostWorkspaceService(getRequest());
});
export const startFacilitatedLearningRoom=createServerFn({method:"POST"}).validator((raw:unknown)=>startFacilitatedLearningRoomInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return startFacilitatedLearningRoomService(getRequest(),data);
});
export const renewFacilitatedLearningPairing=createServerFn({method:"POST"}).validator((raw:unknown)=>renewFacilitatedLearningPairingInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return renewFacilitatedLearningPairingService(getRequest(),data);
});
export const endFacilitatedLearningRoom=createServerFn({method:"POST"}).validator((raw:unknown)=>endFacilitatedLearningRoomInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return endFacilitatedLearningRoomService(getRequest(),data);
});
export const recordFacilitatedPlayback=createServerFn({method:"POST"}).validator((raw:unknown)=>recordFacilitatedPlaybackInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return recordFacilitatedPlaybackService(getRequest(),data);
});
export const pairWithFacilitatedRoom=createServerFn({method:"POST"}).validator((raw:unknown)=>pairWithFacilitatedRoomInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return pairWithFacilitatedRoomService(getRequest(),data);
});
export const leaveFacilitatedRoom=createServerFn({method:"POST"}).validator((raw:unknown)=>leaveFacilitatedRoomInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return leaveFacilitatedRoomService(getRequest(),data);
});
export const getLearnerFacilitatedRoom=createServerFn({method:"GET"}).validator((raw:unknown)=>getLearnerFacilitatedRoomInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getLearnerFacilitatedRoomService(getRequest(),data);
});
