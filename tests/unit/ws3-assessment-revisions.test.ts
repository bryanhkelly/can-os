import {describe,expect,it} from "vitest";
import {latestCanonicalAssessmentRevisions} from "@/domain/canonical-assessment-revisions";
const row=(id:string,revision:number,overrides:Record<string,unknown>={})=>({
  id,attemptId:"attempt-A",resultRevision:revision,supersedesId:null as string|null,
  resultStatus:"finalized",outcome:"pass",...overrides,
});
describe("WS3 canonical assessment final-revision selection",()=>{
  it("takes the latest revision even if a legacy supersedes link is missing",()=>{
    const revision1=row("result-1",1);
    const revision2=row("result-2",2,{
      resultStatus:"finalized",outcome:"fail",
    });
    const projected=latestCanonicalAssessmentRevisions([revision1,revision2]);
    expect(projected.ambiguousAttemptIds).toEqual([]);
    expect(projected.current).toEqual([revision2]);
  });
  it("does not revive an older pass after current grade is voided",()=>{
    const projected=latestCanonicalAssessmentRevisions([
      row("result-1",1),row("result-2",2,{resultStatus:"voided",outcome:null}),
    ]);
    expect(projected.current).toMatchObject([{
      id:"result-2",resultStatus:"voided",outcome:null,
    }]);
  });
  it("flags ambiguous result revisions rather than accepting any pass",()=>{
    expect(latestCanonicalAssessmentRevisions([
      row("result-1",2),row("result-2",2,{outcome:"fail"}),
    ])).toMatchObject({current:[],ambiguousAttemptIds:["attempt-A"]});
    expect(latestCanonicalAssessmentRevisions([
      row("result-1",1),row("result-1",1),
    ])).toMatchObject({current:[],ambiguousAttemptIds:["attempt-A"]});
    expect(latestCanonicalAssessmentRevisions([
      row("result-1",0),
    ])).toMatchObject({current:[],ambiguousAttemptIds:["attempt-A"]});
  });
  it("does not emit a current grade when any revision for that attempt is malformed",()=>{
    const projected=latestCanonicalAssessmentRevisions([
      row("valid",2),row("malformed",0),
    ]);
    expect(projected.ambiguousAttemptIds).toEqual(["attempt-A"]);
    expect(projected.current).toEqual([]);
  });
  it("keeps separate Course assessment attempts distinct",()=>{
    const projection=latestCanonicalAssessmentRevisions([
      row("r1",1),row("r2",3,{attemptId:"attempt-B"}),
    ]);
    expect(projection.ambiguousAttemptIds).toEqual([]);
    expect(projection.current.map(r=>r.attemptId)).toEqual(["attempt-A","attempt-B"]);
  });
});