import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace, readCurriculumAdopterPrograms, installPack, addCurriculumSupplement } from "./curriculum-marketplace.server";
import { rolloverCurriculumAdoption,rollbackAnnualCurriculumAdoption,readAnnualAdoptionEligibility } from "./curriculum-year-adoption.server";
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
/** Annual adoption requires the canonical school-year ID; dates are resolved server-side. */
export const adoptCurriculumPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,versionId:uuid,academicYearId:uuid}).strict().parse(input))
 .handler(async({data})=>rolloverCurriculumAdoption(await actor(),{
  programId:data.programId,packId:data.packId,versionId:data.versionId,
  academicYearId:data.academicYearId
 }));
export const reviewAnnualCurriculumAdoption=createServerFn({method:"GET"})
 .validator((input:unknown)=>program.extend({packId:uuid,academicYearId:uuid}).strict().parse(input))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readAnnualAdoptionEligibility(await actor(),{
   programId:data.programId,packId:data.packId,
   academicYearId:data.academicYearId
  });
 });
export const rollbackCurriculumPackAdoption=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({
  packId:uuid,academicYearId:uuid,reason:z.string().trim().min(8).max(2000)
 }).strict().parse(input))
 .handler(async({data})=>rollbackAnnualCurriculumAdoption(await actor(),data));
const url=z.string().url().max(2048).refine(value=>{
 try{const parsed=new URL(value);return parsed.protocol==="https:"&&!parsed.username&&!parsed.password;}catch{return false;}
},"Use a HTTPS URL without embedded credentials.");
export const addMarketplaceSupplement=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({
   courseVersionId:uuid,academicYearId:uuid.optional(),sectionId:uuid.optional(),lessonId:z.string().min(1).max(100).optional(),
   scope:z.enum(["program","site","section"]),title:z.string().trim().min(3).max(200),
   kind:z.enum(["link","video","pdf","image","audio","document"]),url
 }).strict().parse(input))
 .handler(async({data})=>addCurriculumSupplement(await actor(),data));
