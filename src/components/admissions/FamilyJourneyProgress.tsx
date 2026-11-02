export interface FamilyJourneyMilestone { label: string; complete: boolean; detail?: string }
export function FamilyJourneyProgress({milestones}:{milestones:readonly FamilyJourneyMilestone[]}) {
 return <ol aria-label="Family onboarding progress" className="space-y-2">
  {milestones.map((step,index)=><li key={index} className="flex gap-3 rounded-lg border p-3 text-sm">
   <span aria-label={step.complete?"Complete":"Pending"}>{step.complete?"✓":"○"}</span>
   <div><strong>{step.label}</strong>{step.detail&&<p className="text-xs text-muted-foreground">{step.detail}</p>}</div>
  </li>)}
 </ol>;
}
