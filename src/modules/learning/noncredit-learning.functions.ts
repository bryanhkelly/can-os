import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

/** A Course attempt, not recorded-instructor availability, decides which activities apply. */
export const getLearnerCourseParticipationKind = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseAttemptId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const context=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const access=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId,true);
      return {source:access.source};
    });
  });
