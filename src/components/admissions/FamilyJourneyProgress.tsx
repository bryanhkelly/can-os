import {OutcomeMilestoneList} from "@/components/workspace/outcome-milestones";
export interface FamilyJourneyMilestone { label:string; complete:boolean; detail?:string }
/** Only the existing family reader determines completion. */
export function FamilyJourneyProgress({milestones}:{milestones:readonly FamilyJourneyMilestone[]}){
 return <OutcomeMilestoneList label="Family onboarding progress" items={milestones.map((step,index)=>({
  id:step.label+":"+index,title:step.label,detail:step.detail,state:step.complete?"complete":"pending",
 }))}/>;
}
