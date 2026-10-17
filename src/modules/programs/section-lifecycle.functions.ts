import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {
 sectionLifecycleSnapshot,changeSectionSchedule,changeSectionState,replaceSectionTeacher,
 changeSectionEnrollment,addSectionWaitlist,resolveSectionWaitlist,transferSectionEnrollment,promoteSectionWaitlist
} from "./section-lifecycle-service";
const uuid=z.string().uuid();
async function actor(){
 const ctx=await getCommandContext(getRequest());
 if(!ctx.actorPersonId||ctx.role!=="registrar")throw new AuthorizationError("registrar lifecycle");
 return {...ctx,actorPersonId:ctx.actorPersonId};
}
export const getSectionLifecycle=createServerFn({method:"GET"})
 .validator((v:unknown)=>z.object({programId:uuid}).parse(v))
 .handler(async({data})=>sectionLifecycleSnapshot(await actor(),data.programId));
export const setSectionLifecycleState=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({sectionId:uuid,active:z.boolean(),reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>{await changeSectionState(await actor(),data.sectionId,data.active,data.reason);return {ok:true}});
export const updateSectionLifecycleSchedule=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({sectionId:uuid,scheduleTemplateId:uuid.nullable(),
   startsAt:z.string().datetime().nullable(),endsAt:z.string().datetime().nullable(),
   reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>{await changeSectionSchedule(await actor(),{
  ...data,startsAt:data.startsAt?new Date(data.startsAt):null,endsAt:data.endsAt?new Date(data.endsAt):null
 });return {ok:true}});
export const replaceLifecycleTeacher=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({sectionId:uuid,oldPersonId:uuid,newPersonId:uuid,reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>{await replaceSectionTeacher(await actor(),data);return {ok:true}});
export const transitionLifecycleEnrollment=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({enrollmentId:uuid,status:z.enum(["withdrawn","transferred"]),reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>{await changeSectionEnrollment(await actor(),data);return {ok:true}});
export const queueLifecycleWaitlist=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({sectionId:uuid,studentProfileId:uuid,reason:z.string().trim().max(1000)}).parse(v))
 .handler(async({data})=>{await addSectionWaitlist(await actor(),data);return {ok:true}});
export const resolveLifecycleWaitlist=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({actionId:uuid,reason:z.string().trim().max(1000)}).parse(v))
 .handler(async({data})=>{await resolveSectionWaitlist(await actor(),data.actionId,data.reason);return {ok:true}});

export const transferLifecycleEnrollment=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({enrollmentId:uuid,destinationSectionId:uuid,reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>transferSectionEnrollment(await actor(),data));
export const promoteLifecycleWaitlist=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({actionId:uuid}).parse(v))
 .handler(async({data})=>promoteSectionWaitlist(await actor(),data.actionId));
