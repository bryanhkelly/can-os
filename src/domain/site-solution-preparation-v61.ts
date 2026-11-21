/** Read-only preparation summary over saved, version-pinned Solution plans.
 * This is NEVER a facility inspection, staffing verification or approval.
 * Missing evidence is not equivalent to a failed requirement. */
export type SolutionPreparationModelV61={
  blueprintVersionId:string;title:string;versionNo:number;
  offeringCode?:string|null;
  linkedPublishedOffering?:{offeringVersionId:string}|null;
  components:readonly {
    key:string;requirementMode:string;description?:string|null;
    requiresIndependentReview?:boolean;
  }[];
};
export type SolutionPreparationPlanV61={
  configurationId:string;name:string;blueprintVersionId:string;
  revision:number;lifecycle:string;
};
export type SolutionPreparationCandidateV61={
  offeringCode:string;
  siteOptions:readonly {id:string}[];
  digitalSiteOptions:readonly {id:string}[];
};
export type SolutionPreparationReleaseV61={
  offeringCode:string;siteId:string;status:string;
  opensAt:string|Date;closesAt:string|Date;
};
export type SolutionPreparationViewV61={
  configurationId:string;name:string;revision:number;
  lifecycle:string;template:string|null;templateVersion:number|null;
  offeringCode:string|null;publishedProduct:boolean;
  requiredComponents:readonly {
    key:string;description:string|null;independentReview:boolean;
  }[];
  componentReviewNeeded:number;
  /** Null means the publisher capability was not available for inspection. */
  publisherCandidateCount:number|null;
  /** Null means the release authority was not available for inspection. */
  openRegistrationCount:number|null;
  nextAction:"continue-plan"|"review-submitted-plan"|"resolve-template";
};
export function projectSiteSolutionPreparationV61(input:{
  siteId:string;templates:readonly SolutionPreparationModelV61[];
  configurations:readonly SolutionPreparationPlanV61[];
  candidates?:readonly SolutionPreparationCandidateV61[];
  releases?:readonly SolutionPreparationReleaseV61[];
  now?:Date;
}):SolutionPreparationViewV61[]{
  const now=input.now??new Date();
  return input.configurations.map(plan=>{
    const model=input.templates.find(item=>
      item.blueprintVersionId===plan.blueprintVersionId);
    const required=model?.components.filter(item=>item.requirementMode==="required")??[];
    const code=model?.offeringCode??null;
    const eligible=input.candidates==null?null:
      code?input.candidates.filter(candidate=>candidate.offeringCode===code &&
        [...candidate.siteOptions,...candidate.digitalSiteOptions].some(s=>s.id===input.siteId)).length:0;
    const open=input.releases==null?null:code?input.releases.filter(release=>
      release.offeringCode===code&&release.siteId===input.siteId &&
      release.status==="published"&&new Date(release.opensAt).getTime()<=now.getTime() &&
      new Date(release.closesAt).getTime()>now.getTime()).length:0;
    return {
      configurationId:plan.configurationId,name:plan.name,revision:plan.revision,
      lifecycle:plan.lifecycle,template:model?.title??null,
      templateVersion:model?.versionNo??null,offeringCode:code,
      publishedProduct:Boolean(model?.linkedPublishedOffering),
      requiredComponents:required.map(item=>({
        key:item.key,description:item.description??null,
        independentReview:item.requiresIndependentReview===true,
      })),
      componentReviewNeeded:required.filter(item=>item.requiresIndependentReview).length,
      publisherCandidateCount:eligible,openRegistrationCount:open,
      nextAction:!model?"resolve-template" as const:
        plan.lifecycle==="frozen"?"review-submitted-plan" as const:"continue-plan" as const,
    };
  });
}
