import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { readNoncreditKnowledgeCheck } from "@/modules/learning/noncredit-assessment.server";

const target=z.object({courseAttemptId:z.string().uuid()}).strict();

/** Student's exact enrolled Class is verified BEFORE probing availability.
 * The existing canonical assessment engine governs published questions,
 * provider-issued grants, attempt limits, revocations and result history.
 * Draft assessments never become playable from the existence of a fixture. */
export const getNativeClassKnowledgeCheckAvailability=createServerFn({method:"GET"})
 .validator((raw:unknown)=>target.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   const actor=await getInstructionalLearnerContext(getRequest());
   await db.transaction(async tx=>{
     const access=await authorizeCanonicalCourseAttempt(
       tx,actor,data.courseAttemptId,true);
     if(access.source!=="class")
       throw new AuthorizationError("own native Class Course Attempt");
   });
   try{
     // This reader internally enforces all existing Class assessment gates.
     await readNoncreditKnowledgeCheck(actor,data.courseAttemptId,"final");
     return {available:true as const};
   }catch(error){
     if(!(error instanceof AuthorizationError))throw error;
     return {available:false as const};
   }
 });
