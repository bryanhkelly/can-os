import {describe,expect,it} from "vitest";
import {projectParticipationCredits} from "@/domain/participation-credit-policy";
const issue={id:"issue",kind:"issue" as const,units:10,relatedRegistrationId:null,reversesEventId:null};
const take={id:"use",kind:"consume" as const,units:3,relatedRegistrationId:"registration",reversesEventId:null};
const restore={id:"restore",kind:"restore" as const,units:3,relatedRegistrationId:"registration",reversesEventId:"use"};
describe("community credit accounting",()=>{
 it("does not invent credits",()=>expect(projectParticipationCredits([]).available).toBe(0));
 it("consumes and reverses only the matching registration",()=>{
  expect(projectParticipationCredits([issue,take]).available).toBe(7);
  expect(projectParticipationCredits([issue,take,restore]).available).toBe(10);
 });
 it("rejects excess consumption, duplicate restore and ungrounded restore",()=>{
  expect(()=>projectParticipationCredits([take])).toThrow();
  expect(()=>projectParticipationCredits([issue,take,restore,{...restore,id:"again"}])).toThrow();
  expect(()=>projectParticipationCredits([issue,take,{...restore,relatedRegistrationId:"other"}])).toThrow();
 });
});
