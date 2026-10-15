import {describe,it,expect} from "vitest";
import {canAccessGroup,canApproveMembership,validateGroupInput,validateGroupPost,validateSession} from "../src/domain/study-groups";
describe("GF26 study group rules",()=>{
 it("validates group bounds",()=>{
  expect(validateGroupInput({title:"Algebra help",description:"A group for algebra students",kind:"course",maxMembers:20}).kind).toBe("course");
  expect(()=>validateGroupInput({title:"ab",description:"Valid description",kind:"course",maxMembers:20})).toThrow();
  expect(()=>validateGroupInput({title:"Group",description:"A valid description",kind:"course",maxMembers:51})).toThrow();
 });
 it("blocks unapproved and former members from private content",()=>{
  for(const status of [null,"pending","left","declined"] as const)expect(canAccessGroup(status,"student")).toBe(false);
  expect(canAccessGroup("approved","student")).toBe(true);
 });
 it("does not allow self approval",()=>{
  expect(canApproveMembership("teacher","teacher","student")).toBe(true);
  expect(canApproveMembership("student","teacher","student")).toBe(false);
  expect(canApproveMembership("teacher","teacher","teacher")).toBe(false);
 });
 it("validates post limits and session times",()=>{
  expect(validateGroupPost(" hi ")).toBe("hi");
  expect(()=>validateGroupPost(" ")).toThrow();
  expect(()=>validateGroupPost("x".repeat(3001))).toThrow();
  expect(()=>validateSession("2026-11-02T10:00:00Z","2026-11-02T09:00:00Z")).toThrow();
  expect(()=>validateSession("2026-11-02T10:00:00Z","2026-11-02T15:00:00Z")).toThrow();
 });
});
