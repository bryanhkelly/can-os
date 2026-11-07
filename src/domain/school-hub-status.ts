import { buildLaunchGuidance, type LaunchGuidanceRecord } from "./launch-guidance";
import { plural } from "@/lib/format";
export type SchoolHubStatus = {state:"Not Started"|"In Progress"|"Complete"|"Attention Needed"|"Blocked"|"Unavailable"|"Planned"; detail:string; nextAction:string};
export const unavailableHubStatus:SchoolHubStatus={state:"Unavailable",detail:"Saved records could not be verified.",nextAction:"Refresh this module"};
export const plannedHubStatus:SchoolHubStatus={state:"Planned",detail:"Site-level tools are not available yet.",nextAction:"Continue with another launch module"};
export function websiteHubStatus(address:string|null,content:string|null):SchoolHubStatus {
  if(content==="review_required")return {state:"Attention Needed",detail:"The latest revision needs independent claim review.",nextAction:"Review website content"};
  if(address==="published" && (!content||content==="published"))return {state:"In Progress",detail:"Published in CAN OS. Public website reachability has not been verified; school opening is separate.",nextAction:"Verify public website and continue setup"};
  return {state:address||content?"In Progress":"Not Started",detail:content?"A private content revision is saved.":address?"Private website address prepared.":"No website preparation recorded.",nextAction:address?"Continue website design":"Prepare school website"};
}
export function academicHubStatus(programs:LaunchGuidanceRecord[]):SchoolHubStatus {
  if(!programs.length)return {state:"Not Started",detail:"No academic Program yet. Plan grades and how students will learn.",nextAction:"Start academic setup"};
  const tasks=programs.flatMap(program=>{const academicIds=new Set(program.requirements.filter(item=>/academic|curriculum|teacher|section|school-year|schedule/.test(item.key)).map(item=>item.id));return buildLaunchGuidance(program).tasks.filter(task=>task.requirementId && academicIds.has(task.requirementId));});
  const pending=tasks.filter(task=>task.state!=="complete" || task.pendingEvidenceReview || task.evidenceReviewCorrectionPending);
  return {state:pending.some(task=>task.state==="blocked")?"Attention Needed":tasks.length&&!pending.length?"Complete":"In Progress",detail:`${plural(programs.length,"Program")} saved. ${pending.length} academic requirements remain.`,nextAction:pending[0]?.title??"Review academic configuration"};
}
export function complianceHubStatus(programs:LaunchGuidanceRecord[]):SchoolHubStatus {
  if(!programs.length)return {state:"Blocked",detail:"A Program is needed to resolve applicable opening requirements.",nextAction:"Prepare academics first"};
  const guides=programs.map(buildLaunchGuidance);const pending=guides.flatMap(guide=>guide.pendingBlocking);
  return {state:pending.length?"Attention Needed":"In Progress",detail:pending.length?`${pending.length} blocking Journey requirements remain. Submissions and approvals are distinct.`:"Journey preparation is recorded. Current independent opening authority must still be verified.",nextAction:pending[0]?.title??"Review independent opening authority"};
}
