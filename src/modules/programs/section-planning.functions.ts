import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { evaluateSectionReadiness } from "./section-readiness-service";
import {
  activateDeliveryArrangement,
  createDeliveryArrangement,
} from "@/modules/staffing/delivery-arrangement-service";

const uuid=z.string().uuid();

export const getSectionReadiness=createServerFn({method:"GET"})
 .validator((v:unknown)=>z.object({sectionId:uuid}).parse(v))
 .handler(async({data})=>{
   const context=await getCommandContext(getRequest());
   if(!context.capabilities.has("program.read")&&!context.capabilities.has("capacity.read"))
     throw new Error("Section readiness access denied");
   return evaluateSectionReadiness(data.sectionId);
 });

export const saveDeliveryArrangement=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
   sectionId:uuid,
   academicProviderOrganizationId:uuid,
   capacityReservationId:uuid.nullish(),
   instructorPersonId:uuid.nullish(),
   facilitatorPersonId:uuid.nullish(),
   modality:z.enum(["onsite","live_online","asynchronous","hybrid"]),
   status:z.enum(["proposed","reserved","ready","active"]).optional(),
   effectiveFrom:z.string().datetime().nullish(),
   effectiveThrough:z.string().datetime().nullish(),
 }).parse(v))
 .handler(async({data})=>{
   const effectiveFrom=typeof data.effectiveFrom==="string"?new Date(data.effectiveFrom):null;
   const effectiveThrough=typeof data.effectiveThrough==="string"?new Date(data.effectiveThrough):null;
   return createDeliveryArrangement(await getCommandContext(getRequest()),{
     sectionId:data.sectionId,
     academicProviderOrganizationId:data.academicProviderOrganizationId,
     capacityReservationId:data.capacityReservationId??null,
     instructorPersonId:data.instructorPersonId??null,
     facilitatorPersonId:data.facilitatorPersonId??null,
     modality:data.modality,
     status:data.status,
     effectiveFrom,
     effectiveThrough,
   });
 });

export const activateSectionDelivery=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({arrangementId:uuid}).parse(v))
 .handler(async({data})=>{
   await activateDeliveryArrangement(await getCommandContext(getRequest()),data.arrangementId);
   return {ok:true};
 });
