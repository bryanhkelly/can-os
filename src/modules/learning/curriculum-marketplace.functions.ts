import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace, readCurriculumAdopterPrograms, installPack, adoptPack, addCurriculumSupplement } from "./curriculum-marketplace.server";
import { readCurriculumJourneyReadiness } from "./curriculum-journey-readiness.server";

const uuid=z.string().uuid();
const program=z.object({programId:uuid}).strict();
const actor=()=>requireActor(["registrar"]);
export const getCurriculumAdopterPrograms=createServerFn({method:"GET"})
 .handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readCurriculumAdopterPrograms(await actor());
 });
export const getCurriculumJourneyReadiness=createServerFn({method:"GET"})
 .validator((input:unknown)=>program.parse(input))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readCurriculumJourneyReadiness(await actor(),data.programId);
 });
export const getCurriculumMarketplace=createServerFn({method:"GET"})
 .validator((input:unknown)=>program.parse(input))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readMarketplace(await actor(),data.programId);
 });
export const installCurriculumPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,termsAccepted:z.literal(true)}).strict().parse(input))
 .handler(async({data})=>installPack(await actor(),data));
export const adoptCurriculumPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,versionId:uuid}).strict().parse(input))
 .handler(async({data})=>adoptPack(await actor(),data));
const url=z.string().url().max(2048).refine(value=>{
 try{const parsed=new URL(value);return parsed.protocol==="https:"&&!parsed.username&&!parsed.password;}catch{return false;}
},"Use a HTTPS URL without embedded credentials.");
export const addMarketplaceSupplement=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({
   courseVersionId:uuid,sectionId:uuid.optional(),lessonId:z.string().min(1).max(100).optional(),
   scope:z.enum(["program","site","section"]),title:z.string().trim().min(3).max(200),
   kind:z.enum(["link","video","pdf","image","audio","document"]),url
 }).strict().parse(input))
 .handler(async({data})=>addCurriculumSupplement(await actor(),data));
