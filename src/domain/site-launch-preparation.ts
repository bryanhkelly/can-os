/** UI workstream selection only, never accreditation, funding, safeguarding,
 * school classification, publication or an enrollment authorization.
 * Real curriculum classification lives in the governed academic Offering.
 * Here a saved school-year Program opens its applicable preparation screens. */
export type SiteLaunchProgramSummary = {
  type:string;
  status:string;
  gradeRange?:{min:string;max:string}|null;
};
const schoolYearModels=new Set([
  "church_hosted_academy","high_school_extension","full_school",
  "microschool","hybrid_program","homeschool_cohort",
]);
function gradeNumber(value:string):number|null{
  const normalized=value.trim().toLowerCase();
  if(["k","kindergarten"].includes(normalized))return 0;
  const match=/^(?:grade\s*)?(\d{1,2})$/.exec(normalized);
  const numeric=match?Number(match[1]):NaN;
  return Number.isInteger(numeric)&&numeric<=12?numeric:null;
}
export function preparesSchoolYear(program:SiteLaunchProgramSummary):boolean{
  if(!schoolYearModels.has(program.type)||
     !["draft","launching","ready","active"].includes(program.status)||
     !program.gradeRange)return false;
  const min=gradeNumber(program.gradeRange.min);
  const max=gradeNumber(program.gradeRange.max);
  return min!==null&&max!==null&&min<=max&&max>=6&&min<=12;
}
export function siteLaunchPreparation(
  programs:readonly SiteLaunchProgramSummary[]|null,
  proposedInterestIds:readonly string[],
){
  const academicInterest=proposedInterestIds.some(id=>id==="grades-6-8"||id==="grades-9-12");
  const hasSchoolYearProgram=programs?.some(preparesSchoolYear)??false;
  return {
    programRecordsAvailable:programs!==null,
    showAcademicPreparation:academicInterest||hasSchoolYearProgram,
    // A private interest alone can never authorize or demand opening review.
    showSchoolOpeningPreparation:hasSchoolYearProgram,
  };
}
