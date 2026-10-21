import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { unitDraftSchema } from "@/domain/class-unit-releases";
import { requireActor } from "@/modules/identity/actors.server";
import {
  createClassUnitDraft,getClassUnitDraft,saveClassUnitDraft,reviewClassUnitDraft,
  publishClassUnit,adoptClassUnit,
} from "./curriculum-units.server";

const uuid=z.string().uuid();
const school=()=>requireActor(["registrar"],"curriculum.publish");
const target=z.object({programId:uuid,unitVersionId:uuid}).strict();
export const startClassUnitDraft=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({programId:uuid,baseCourseVersionId:uuid,
  unitKey:z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),requestId:uuid}).strict().parse(input))
 .handler(async({data})=>createClassUnitDraft(await school(),data));
export const getAuthoredClassUnit=createServerFn({method:"GET"})
 .validator((input:unknown)=>target.parse(input))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return getClassUnitDraft(await school(),data);
 });
export const saveAuthoredClassUnit=createServerFn({method:"POST"})
 .validator((input:unknown)=>target.extend({expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),
  draft:unitDraftSchema}).strict().parse(input))
 .handler(async({data})=>saveClassUnitDraft(await school(),data));
export const reviewAuthoredClassUnit=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({sectionId:uuid,unitVersionId:uuid}).strict().parse(input))
 .handler(async({data})=>reviewClassUnitDraft(await requireActor(["teacher"]),data));
export const publishAuthoredClassUnit=createServerFn({method:"POST"})
 .validator((input:unknown)=>target.parse(input))
 .handler(async({data})=>publishClassUnit(await school(),data));
export const adoptPublishedClassUnit=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({programId:uuid,sectionId:uuid,unitVersionId:uuid,
  availableAt:z.coerce.date().optional()}).strict().parse(input))
 .handler(async({data})=>adoptClassUnit(await school(),data));
