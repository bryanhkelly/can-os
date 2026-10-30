import { z } from "zod";

/** Planning document, NOT an approved transcript credit policy or published class release. */
const courseWeek = z.object({
  week: z.number().int().min(1).max(52),
  unitId: z.string().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().trim().min(4).max(160),
  focus: z.string().trim().min(15).max(800),
  standards: z.array(z.string().min(3).max(40)).min(1).max(30),
  plannedInstructionalDays: z.number().int().min(1).max(7),
  estimatedMinutesPerDay: z.number().int().min(20).max(120),
  plannedAssessmentCount: z.number().int().min(1).max(20),
  status: z.enum(["planned","authored","reviewed","approved"]),
}).strict();

export const yearlongCourseBlueprintSchema = z.object({
  schemaVersion: z.literal(1),
  courseCode: z.string().min(2).max(32),
  title: z.string().min(3).max(160),
  targetInstructionalWeeks: z.number().int().min(1).max(52),
  reviewStatus: z.enum(["planning","teacher_review","school_approved"]),
  creditStatus: z.enum(["not_credit_ready","credit_ready"]),
  scopeNote: z.string().min(20).max(2000),
  standardsAuthorityUrl: z.string().url().refine(v=>new URL(v).protocol==="https:"),
  weeks: z.array(courseWeek).min(1).max(52),
}).strict().superRefine((plan,ctx)=>{
  if(plan.weeks.length!==plan.targetInstructionalWeeks)
    ctx.addIssue({code:"custom",message:"Every instructional week must have an explicit plan."});
  const numbers=plan.weeks.map(w=>w.week);
  if(new Set(numbers).size!==numbers.length ||
    !numbers.every(n=>n>=1&&n<=plan.targetInstructionalWeeks) ||
    numbers.some((n,i)=>n!==i+1))
    ctx.addIssue({code:"custom",message:"Week numbers must be consecutive, ordered and unique."});
  if(plan.creditStatus==="credit_ready" &&
    (plan.reviewStatus!=="school_approved"||plan.weeks.some(w=>w.status!=="approved")))
    ctx.addIssue({code:"custom",message:"Credit readiness requires every week and the school review to be approved."});
  if(plan.reviewStatus==="school_approved"&&plan.weeks.some(w=>w.status!=="approved"))
    ctx.addIssue({code:"custom",message:"A school-approved blueprint requires approved units throughout."});
});
export type YearlongCourseBlueprint=z.infer<typeof yearlongCourseBlueprintSchema>;

export function courseBlueprintCoverage(plan:YearlongCourseBlueprint) {
  const weeks=plan.weeks;
  return {
    plannedWeeks:plan.targetInstructionalWeeks,
    authoredWeeks:weeks.filter(w=>w.status!=="planned").length,
    reviewedWeeks:weeks.filter(w=>w.status==="reviewed"||w.status==="approved").length,
    approvedWeeks:weeks.filter(w=>w.status==="approved").length,
    estimatedInstructionalMinutes:weeks.reduce((sum,w)=>sum+w.plannedInstructionalDays*w.estimatedMinutesPerDay,0),
    plannedAssessmentCount:weeks.reduce((sum,w)=>sum+w.plannedAssessmentCount,0),
    isCreditReady:plan.creditStatus==="credit_ready"&&plan.reviewStatus==="school_approved"&&
      weeks.every(w=>w.status==="approved"),
  };
}
