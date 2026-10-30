export type ProgramIndicators={sections:number;enrollments:number;teachers:number;calendarDays:number};
export type Indicator={key:"sections"|"enrollments"|"teachers"|"calendar";label:string;count:number;state:"evidence_present"|"not_configured"};
/** Operational evidence presence is NOT a compliance or accreditation determination. */
export function programIndicators(counts:ProgramIndicators):Indicator[]{
 return [
  {key:"sections",label:"Course sections",count:counts.sections},
  {key:"enrollments",label:"Student enrollments",count:counts.enrollments},
  {key:"teachers",label:"Teaching assignments",count:counts.teachers},
  {key:"calendar",label:"Calendar days",count:counts.calendarDays},
 ].map(x=>({...x,state:x.count>0?"evidence_present" as const:"not_configured" as const})) as Indicator[];
}
