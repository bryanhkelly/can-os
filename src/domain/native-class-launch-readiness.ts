/** UI-only readiness projection over separately authorized source reads.
 * Never turns a missing/failed read into a positive approval, never infers
 * a globally empty catalog from paged operator results, and never authorizes
 * Class creation. Every write rechecks publisher, adoption and Site scope. */
export type ClassReadState="pending"|"error"|"success";
export type ClassReadinessStatus="checking"|"unavailable"|"action_required"|"visible";

export interface ClassLaunchReadState {
  operatorSites:ClassReadState;
  authorizedSiteCount:number;
  adoptedCourses:ClassReadState;
  visibleAdoptedCourseCount:number;
  visibleDraftClasses:ClassReadState;
  visibleDraftClassCount:number;
  filtered:boolean;
}

export interface ClassLaunchReadinessStep {
  key:"site"|"course"|"class";
  label:string;
  status:ClassReadinessStatus;
  detail:string;
}

export function projectClassLaunchReadiness(state:ClassLaunchReadState):ClassLaunchReadinessStep[]{
  const read=(status:ClassReadState,count:number,positive:string,empty:string,
    filteredEmpty?:string):{status:ClassReadinessStatus;detail:string}=>{
    if(status==="pending")return {status:"checking",detail:"Checking current authorized records."};
    if(status==="error")return {status:"unavailable",detail:"Unable to verify authorization or records. No readiness is assumed."};
    if(count>0)return {status:"visible",detail:positive};
    return {status:"action_required",detail:state.filtered&&filteredEmpty?filteredEmpty:empty};
  };
  return [
    {key:"site",label:"Authorized delivery Site",...read(
      state.operatorSites,state.authorizedSiteCount,
      "At least one current operator Site is visible. Exact Site permissions are verified when creating a Class.",
      "No eligible operator Site is visible. Complete Site identity and current operator authorization first."
    )},
    {key:"course",label:"Published Course and local adoption",...read(
      state.adoptedCourses,state.visibleAdoptedCourseCount,
      "At least one published, locally adopted Course option is visible. Selecting a Course still requires current authorization.",
      "No approved Course adoption is visible for this operator. Publication and local adoption must be completed separately.",
      "No matching approved Course options are visible for the current filter. Clear the filter before inferring a missing adoption."
    )},
    {key:"class",label:"Created native Class",...read(
      state.visibleDraftClasses,state.visibleDraftClassCount,
      "At least one authorized Class appears in the current operator list. Activation, registration and dated Sessions require separate checks.",
      "No native Class appears in the current operator list. Create one from an approved Course and authorized Site; do not seed Class rows directly."
    )},
  ];
}
