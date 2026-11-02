import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace, readCurriculumAdopterPrograms, installPack, adoptPack, addCurriculumSupplement } from "./curriculum-marketplace.server";
import { readCurriculumJourneyReadiness } from "./curriculum-journey-readiness.server";
import { rolloverCurriculumAdoption, rollbackAnnualCurriculumAdoption, readAnnualAdoptionEligibility } from "./curriculum-year-adoption.server";
import { AuthorizationError } from "@/domain/command-context";

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
 .handler(async({data})=>{
  // Never create a new unscoped adoption after annual licensing is activated.
  // Historical adoptions remain readable; new grants must use the explicit
  // school-year command and its verified publisher entitlement.
  requireLegacyAdoptionWriteEnabled();
  return adoptPack(await actor(),data);
 });
/** Explicit compatibility gate: historical records remain readable, but
 * enabling annual adoption disables creation of new unscoped grants.
 * This also permits an operator to close legacy writes before migration.
 */
function requireLegacyAdoptionWriteEnabled() {
 if(process.env.CAN_ANNUAL_ADOPTIONS_ENABLED==="true" ||
    process.env.CAN_DISABLE_LEGACY_CURRICULUM_ADOPTIONS==="true")
  throw new AuthorizationError("New curriculum adoption requires a verified school-year license and annual adoption workflow");
}
/**
 * Year-scoped adoption is staged on FullFlow but its SQL migration has NOT
 * been approved/applied. Leave the working legacy adoption path unchanged.
 * These new commands explicitly fail closed until the unified migration and
 * institutional licensing tests have been accepted.
 */
function requireAnnualAdoptionEnabled() {
 // A single flag is insufficient: prevent accidental activation of
 // unregistered schema and unverified publisher/Section rights in production.
 if(process.env.CAN_ANNUAL_ADOPTIONS_ENABLED!=="true" ||
    process.env.CAN_ANNUAL_ADOPTIONS_SCHEMA_READY!=="true" ||
    process.env.CAN_ANNUAL_ADOPTIONS_CONNECTED_ACCEPTANCE!=="true")
  throw new AuthorizationError("Annual curriculum adoption awaits schema and connected release acceptance");
}
export const reviewAnnualCurriculumAdoption=createServerFn({method:"GET"})
 .validator((input:unknown)=>program.extend({packId:uuid,academicYearId:uuid}).strict().parse(input))
 .handler(async({data})=>{
  requireAnnualAdoptionEnabled();
  setResponseHeader("Cache-Control","private, no-store");
  return readAnnualAdoptionEligibility(await actor(),data);
 });
export const rolloverAnnualCurriculumAdoption=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,versionId:uuid,academicYearId:uuid}).strict().parse(input))
 .handler(async({data})=>{
  requireAnnualAdoptionEnabled();
  return rolloverCurriculumAdoption(await actor(),data);
 });
export const rollbackAnnualCurriculumPackAdoption=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,academicYearId:uuid,reason:z.string().trim().min(8).max(2000)}).strict().parse(input))
 .handler(async({data})=>{
  requireAnnualAdoptionEnabled();
  return rollbackAnnualCurriculumAdoption(await actor(),data);
 });
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
