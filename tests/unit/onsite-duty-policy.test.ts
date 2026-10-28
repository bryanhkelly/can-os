import { describe, expect, it } from "vitest";
import {
  isOnsiteDutySubstitution, resolveOnsiteDutyRetry, selectAuthorizedOnsiteDuty,
  type DutyAssignmentCandidate,
} from "@/domain/onsite-duty-policy";

const block:DutyAssignmentCandidate={
  sectionId:"section-a",periodId:"period-morning",programId:"program-a",
  canRespond:true,canAccept:true,planToken:"current-plan-fingerprint",
  requiresSectionDelegation:false,startsAtLocal:"08:30",endsAtLocal:"09:30",
};
const input={
  siteMatches:true,projectionTruncated:false,scopedProgramIds:["program-a"],
  sectionId:block.sectionId,periodId:block.periodId,
  response:"accepted" as const,
};

describe("Hybrid onsite assigned-duty authorization",()=>{
  it("allows the current verified adult to state availability on an unconflicted block",()=>{
    expect(selectAuthorizedOnsiteDuty(input,[block])).toEqual(block);
    expect(selectAuthorizedOnsiteDuty({
      ...input,response:"cannot_cover",
    },[{...block,canAccept:false}])).toMatchObject({canRespond:true});
  });
  it("rejects wrong site, program, period, capped plan or unassigned adult",()=>{
    for(const change of [
      {siteMatches:false},{projectionTruncated:true},
      {scopedProgramIds:["another-program"]},
      {sectionId:"section-b"},{periodId:"period-afternoon"},
    ]){
      expect(()=>selectAuthorizedOnsiteDuty({...input,...change},[block])).toThrow();
    }
    expect(()=>selectAuthorizedOnsiteDuty(input,[{...block,canRespond:false}])).toThrow();
    expect(()=>selectAuthorizedOnsiteDuty(input,[{...block,planToken:""}])).toThrow();
  });
  it("will not record accepted coverage for a conflicted assignment",()=>{
    expect(()=>selectAuthorizedOnsiteDuty(input,[{...block,canAccept:false}])).toThrow();
    expect(selectAuthorizedOnsiteDuty({...input,response:"cannot_cover"},[
      {...block,canAccept:false},
    ])).toBeTruthy();
  });
  it("detects a changed named adult without mislabeling room-only changes",()=>{
    const current={...block,facilitatorPersonId:"adult-new"};
    expect(isOnsiteDutySubstitution(current,{
      sectionId:block.sectionId,ownerPersonId:"adult-old",
      metadata:{periodId:block.periodId,planToken:"previous-plan"},
    })).toBe(true);
    expect(isOnsiteDutySubstitution(current,{
      sectionId:block.sectionId,ownerPersonId:"adult-new",
      metadata:{periodId:block.periodId,planToken:"room-only-change"},
    })).toBe(false);
    expect(isOnsiteDutySubstitution(current,{
      sectionId:"another-section",ownerPersonId:"adult-old",
      metadata:{periodId:block.periodId,planToken:"previous-plan"},
    })).toBe(false);
    expect(isOnsiteDutySubstitution(current,{
      sectionId:block.sectionId,ownerPersonId:null,
      metadata:{periodId:block.periodId,planToken:"previous-plan"},
    })).toBe(false);
  });
  it("only permits an exact idempotent retry, not erasing a coverage exception",()=>{
    expect(resolveOnsiteDutyRetry(null,{response:"accepted"})).toBeNull();
    expect(resolveOnsiteDutyRetry({id:"response-a",response:"accepted"},
      {response:"accepted"})).toEqual({
        responseId:"response-a",response:"accepted",created:false,
      });
    expect(resolveOnsiteDutyRetry({
      id:"response-a",response:"cannot_cover",reason:"unavailable",
    },{response:"cannot_cover",reason:"unavailable"})).toMatchObject({
      responseId:"response-a",created:false,
    });
    expect(()=>resolveOnsiteDutyRetry({
      id:"response-a",response:"cannot_cover",reason:"unavailable",
    },{response:"accepted"})).toThrow();
    expect(()=>resolveOnsiteDutyRetry({
      id:"response-a",response:"cannot_cover",reason:"unavailable",
    },{response:"cannot_cover",reason:"other"})).toThrow();
  });
});
