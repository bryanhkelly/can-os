import { describe, expect, it } from "vitest";
import { projectedRolloutStages } from "@/domain/program-rollout-lifecycle";

const seeded={
  publisherPublished:true,adoptionApproved:true,siteAuthorized:true,
  localClassCount:0,activeClassCount:0,publishedClassOfferingCount:0,
};
describe("WS5 publisher-to-local rollout lifecycle projection",()=>{
  it("distinguishes publisher publication, adoption and Site readiness from Class creation",()=>{
    const stages=projectedRolloutStages(seeded);
    expect(stages.map(s=>s.complete)).toEqual([true,true,true,false,false,false]);
  });
  it("permits privately assigned active Classes without a registration Offering",()=>{
    const stages=projectedRolloutStages({...seeded,localClassCount:2,activeClassCount:1});
    expect(stages.find(s=>s.key==="class_active")?.complete).toBe(true);
    expect(stages.find(s=>s.key==="class_offering_published")?.complete).toBe(false);
  });
  it("marks optional public/unlisted enrollment publication only with independent evidence",()=>{
    const stages=projectedRolloutStages({
      ...seeded,localClassCount:4,activeClassCount:4,publishedClassOfferingCount:2,
    });
    expect(stages.every(s=>s.complete)).toBe(true);
  });
  it("rejects invented or out-of-range rollup counts",()=>{
    for(const localClassCount of [-1,0.5,NaN]){
      expect(()=>projectedRolloutStages({...seeded,localClassCount})).toThrow();
    }
    expect(()=>projectedRolloutStages({
      ...seeded,localClassCount:1,activeClassCount:2,
    })).toThrow();
  });
});
