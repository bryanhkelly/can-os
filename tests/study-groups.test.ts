import {describe,it,expect} from "vitest";
import {canAccessGroup,canApproveMembership,validateGroupInput,validateGroupPost,validateSession} from "../src/domain/study-groups";
describe("GF26 study group safeguards",()=>{
 it("rejects invalid group setup",()=>{expect(()=>validateGroupInput({title:"ab",description:"valid longer description",kind:"course",maxMembers:20})).toThrow();expect(()=>validateGroupInput({title:"Good group",description:"valid longer description",kind:"other",maxMembers:20})).toThrow();});
 it("restricts peer content to approved members",()=>{expect(canAccessGroup("pending","student")).toBe(false);expect(canAccessGroup("left","student")).toBe(false);expect(canAccessGroup("approved","student")).toBe(true);});
 it("requires an independent facilitator to review",()=>{expect(canApproveMembership("facilitator","facilitator","student")).toBe(true);expect(canApproveMembership("student","facilitator","student")).toBe(false);});
 it("validates posts and sessions",()=>{expect(()=>validateGroupPost(" ")).toThrow();expect(()=>validateGroupPost("x".repeat(3001))).toThrow();expect(()=>validateSession("2026-10-20T10:00:00Z","2026-10-20T09:00:00Z")).toThrow();});
});
