/**
 * A real-time projection of separately governed publisher/adoption/Class
 * milestones. Not a persisted rollout ledger or authorization shortcut.
 * Class identity, registration publication and completed participation
 * are separate facts, never synthesized from one another.
 */
export type RolloutStageKey=
  |"publisher_published"|"adoption_approved"|"site_authorized"
  |"class_created"|"class_active"|"class_offering_published";
export type RolloutStage={key:RolloutStageKey;label:string;complete:boolean};
export type RolloutEvidence={
  publisherPublished:boolean;
  adoptionApproved:boolean;
  siteAuthorized:boolean;
  localClassCount:number;
  activeClassCount:number;
  publishedClassOfferingCount:number;
};
export function projectedRolloutStages(evidence:RolloutEvidence):RolloutStage[]{
  for(const count of [
    evidence.localClassCount,evidence.activeClassCount,evidence.publishedClassOfferingCount,
  ])if(!Number.isInteger(count)||count<0)throw new Error("Rollout counts must be nonnegative integers.");
  if(evidence.activeClassCount>evidence.localClassCount||
    evidence.publishedClassOfferingCount>evidence.localClassCount)
    throw new Error("Class stage evidence exceeds its locally scoped Class count.");
  return [
    {key:"publisher_published",label:"Publisher version published",
      complete:evidence.publisherPublished},
    {key:"adoption_approved",label:"Adoption approved",
      complete:evidence.adoptionApproved},
    {key:"site_authorized",label:"Local Site authorized",
      complete:evidence.siteAuthorized},
    {key:"class_created",label:"Class prepared",
      complete:evidence.localClassCount>0},
    {key:"class_active",label:"Class active",
      complete:evidence.activeClassCount>0},
    {key:"class_offering_published",label:"Registration published (optional)",
      complete:evidence.publishedClassOfferingCount>0},
  ];
}
