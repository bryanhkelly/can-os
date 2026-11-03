import { describe, expect, it } from "vitest";
import { projectLaunchJurisdictionResearch } from "@/domain/jurisdiction-launch-research";

const evidence=[{title:"State education agency",url:"https://example.gov/policy",authority:"Education agency",checkedAt:"2026-11-03T00:00:00.000Z"}];
const base={
  status:"in_review", revision:"research-1", publishedAt:null,
  summary:"Preliminary state education research.",
  evidence,
  profile:{
    operatingModels:["church-hosted"],
    fundingPrograms:[{
      id:"fund",name:"State choice program",summary:"Eligibility is conditional.",
      eligibilityStatus:"verified",evidenceIds:["https://example.gov/policy"],
    }],
    requirements:[
      {id:"public",title:"Review licensing",description:"Confirm school status with the state.",
        responsibleParty:"can",phase:"before_opening",disclosureAudience:"public_optional",
        evidenceIds:["https://example.gov/policy"]},
      {id:"private",title:"Internal legal deliberation",description:"Privileged.",
        responsibleParty:"can",phase:"before_opening",disclosureAudience:"internal_only",evidenceIds:[]},
    ],
  },
};
describe("launch jurisdiction research projection",()=>{
  it("labels in-review funding as research and hides internal-only requirements",()=>{
    const result=projectLaunchJurisdictionResearch(base,false);
    expect(result?.guidanceStatus).toBe("research_only");
    expect(result?.fundingPrograms[0]?.eligibilityStatus).toBe("under_review");
    expect(result?.investigationItems.map(item=>item.id)).toEqual(["public"]);
    expect(result?.fundingPrograms[0]?.sources[0]?.url).toBe("https://example.gov/policy");
  });
  it("does not surface unsourced drafts",()=>{
    expect(projectLaunchJurisdictionResearch({...base,evidence:[]},false)).toBeNull();
  });
  it("preserves published status only when independently verified by caller",()=>{
    expect(projectLaunchJurisdictionResearch({...base,status:"published"},false)?.guidanceStatus).toBe("research_only");
    expect(projectLaunchJurisdictionResearch({...base,status:"published"},true)?.guidanceStatus).toBe("verified_guidance");
  });
});
