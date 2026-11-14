import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { eq } from "drizzle-orm";
import { noncreditRegistrations,noncreditTrainingVersions } from "@/db/canonical-v301";

/** A Course attempt, not recorded-instructor availability, decides which activities apply. */
export const getLearnerCourseParticipationKind = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseAttemptId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const context=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const access=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId,true);
      if(access.source!=="noncredit"||!access.noncreditRegistrationId)
        return {source:access.source,hasBaseline:false,hasFinal:false};
      const [reg]=await tx.select().from(noncreditRegistrations)
        .where(eq(noncreditRegistrations.id,access.noncreditRegistrationId)).limit(1);
      const [training]=reg?await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,reg.trainingVersionId)).limit(1):[];
      return {source:access.source,hasBaseline:!!training?.baselineAssessmentVersionId,
        hasFinal:!!training?.assessmentVersionId};
    });
  });
