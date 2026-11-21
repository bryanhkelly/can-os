import { describe,it,expect } from "vitest";
import { projectSiteSolutionPreparationV61 } from "./site-solution-preparation-v61";
const config={configurationId:"plan-1",name:"Adult Digital Skills",
  blueprintVersionId:"version-1",revision:2,lifecycle:"draft"};
const template={blueprintVersionId:"version-1",title:"Digital Skills",versionNo:3,
  offeringCode:"training.one",linkedPublishedOffering:{offeringVersionId:"pub-1"},
  components:[{key:"internet",requirementMode:"required",description:"Reliable connection"},
    {key:"safeguarding",requirementMode:"required",requiresIndependentReview:true},
    {key:"optional",requirementMode:"optional"}]};
describe("Site Solution preparation projection",()=>{
  it("shows required components without claiming verification",()=>{
    const [value]=projectSiteSolutionPreparationV61({siteId:"site-1",templates:[template],
      configurations:[config]});
    expect(value).toMatchObject({template:"Digital Skills",templateVersion:3,
      componentReviewNeeded:1,publisherCandidateCount:null,openRegistrationCount:null,
      nextAction:"continue-plan"});
    expect(value?.requiredComponents).toHaveLength(2);
  });
  it("keeps unrelated Site publisher candidates out of Open",()=>{
    const [value]=projectSiteSolutionPreparationV61({
      siteId:"site-1",templates:[template],configurations:[{...config,lifecycle:"frozen"}],
      candidates:[{offeringCode:"training.one",siteOptions:[{id:"another-site"}],digitalSiteOptions:[]}],
      releases:[{offeringCode:"training.one",siteId:"another-site",status:"published",
        opensAt:"2026-11-01T00:00:00Z",closesAt:"2026-12-01T00:00:00Z"}],
      now:new Date("2026-11-21T00:00:00Z"),
    });
    expect(value?.publisherCandidateCount).toBe(0);
    expect(value?.openRegistrationCount).toBe(0);
    expect(value?.nextAction).toBe("review-submitted-plan");
  });
  it("does not pretend a retired template is a rejected plan",()=>{
    const [value]=projectSiteSolutionPreparationV61({siteId:"site-1",
      templates:[],configurations:[config]});
    expect(value?.template).toBeNull();
    expect(value?.nextAction).toBe("resolve-template");
  });
});
