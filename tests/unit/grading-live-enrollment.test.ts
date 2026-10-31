import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
  members:vi.fn(),authority:vi.fn(),update:vi.fn(),audit:vi.fn(),event:vi.fn(),
}));
vi.mock("@/modules/learning/current-section-enrollment.server",()=>({currentSectionStudentIds:state.members}));
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:state.authority}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notify:vi.fn()}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn({
  select:()=>{
    const chain:Record<string,unknown>={};
    for(const name of ["from","innerJoin","where","limit"])chain[name]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve([{
      id:"submission",status:"submitted",timeliness:"late",assessmentId:"assessment",
      pointsPossible:"10",studentProfileId:"student",sectionId:"section",programId:"program",schoolYearId:"year",
    }]).then(resolve);
    return chain;
  },update:state.update,
})}}));
import { gradeSubmission } from "@/modules/learning/missing-work-service";
const context={actorPersonId:"teacher",role:"teacher",capabilities:new Set(["submission.grade"]),
  scope:{sectionIds:["section"]}};
beforeEach(()=>{
  vi.clearAllMocks();
  state.authority.mockResolvedValue({});
  state.members.mockResolvedValue(["student"]);
  state.update.mockReturnValue({set:()=>({where:()=>({returning:async()=>[{id:"submission"}]})})});
});
describe("grading requires the current student enrollment relationship",()=>{
  it("saves private grading without changing submission status, score or releasing feedback",async()=>{
    const write=vi.fn((_values:Record<string,unknown>)=>({where:()=>({returning:async()=>[{id:"submission"}]})}));
    state.update.mockReturnValue({set:write});
    await gradeSubmission(context,"submission",{score:"8",feedback:{comment:"Private draft"},draftOnly:true});
    expect(write).toHaveBeenCalledWith(expect.objectContaining({feedback:{gradingDraft:expect.objectContaining({
      score:"8",feedback:{comment:"Private draft"},
    })}}));
    const values=write.mock.calls[0][0] as Record<string,unknown>;
    expect(values).not.toHaveProperty("score");
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("gradedAt");
    expect(state.event).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({eventType:"SubmissionGradingDraftSaved"}));
  });
  it("does not save a private grading draft for a withdrawn learner",async()=>{
    state.members.mockResolvedValue([]);
    await expect(gradeSubmission(context,"submission",{score:"8",draftOnly:true})).rejects.toThrow("current Program and Section");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects a stale submission after Program or Section enrollment ends",async()=>{
    state.members.mockResolvedValue([]);
    await expect(gradeSubmission(context,"submission",{score:"8"})).rejects.toThrow("current Program and Section");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
  it("grades only the exact current student inside the authorized Section",async()=>{
    await gradeSubmission(context,"submission",{score:"8",feedback:{comment:"Good revision"}});
    expect(state.members).toHaveBeenCalledWith(expect.anything(),
      {id:"section",programId:"program",schoolYearId:"year"},"student");
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
  });
  it("rechecks teaching delegation before accepting a score",async()=>{
    state.authority.mockRejectedValue(new Error("delegation revoked"));
    await expect(gradeSubmission(context,"submission",{score:"8"})).rejects.toThrow("delegation revoked");
    expect(state.update).not.toHaveBeenCalled();
  });
});


describe("canonical grading score bounds",()=>{
 it.each(["", " ", "NaN", "Infinity", "-1", "10.01"])("rejects an invalid score from any caller: %s",async score=>{
  await expect(gradeSubmission(context,"submission",{score})).rejects.toThrow("Score must be from 0 to 10");
  expect(state.update).not.toHaveBeenCalled();
  expect(state.event).not.toHaveBeenCalled();
 });
 it("accepts a real zero score",async()=>{
  await gradeSubmission(context,"submission",{score:"0"});
  expect(state.update).toHaveBeenCalledOnce();
 });
});
