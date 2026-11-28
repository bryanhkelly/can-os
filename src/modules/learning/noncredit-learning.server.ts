import { z } from "zod";
import { db } from "@/db/client";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { eq } from "drizzle-orm";
import { noncreditRegistrations,noncreditTrainingVersions } from "@/db/canonical-v301";

/** A Course attempt, not recorded-instructor availability, decides which activities apply. */
export const participationKindInput=z.object({courseAttemptId:z.string().uuid()}).strict();

export async function getLearnerCourseParticipationKindService(request:Request,data:z.infer<typeof participationKindInput>){
    const context=await getInstructionalLearnerContext(request);
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
}
