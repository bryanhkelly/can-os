import {describe,expect,it} from "vitest";
import {studentSiteScope} from "@/domain/student-site-scope";
import type {CommandContext} from "@/domain/command-context";

const actor:CommandContext & {grantSiteId:string|null}={
  actorPersonId:"person",role:"student",grantSiteId:"site",
  capabilities:new Set(["student:read"]),
  scope:{organizationIds:["org"],siteIds:["site"]},
};
describe("exact student Site membership",()=>{
  it("projects a verified current student grant without expanding scope",()=>{
    expect(studentSiteScope(actor)).toEqual({personId:"person",siteId:"site",organizationId:"org"});
  });
  it("denies missing, expanded, inconsistent and empty scope",()=>{
    const cases=[
      {...actor,grantSiteId:null},
      {...actor,grantSiteId:"other"},
      {...actor,scope:{organizationIds:["org"],siteIds:["site","other"]}},
      {...actor,scope:{organizationIds:["org","other"],siteIds:["site"]}},
      {...actor,scope:{organizationIds:[],siteIds:["site"]}},
      {...actor,scope:{organizationIds:["org"],siteIds:[]}},
      {...actor,scope:{}},
      {...actor,scope:{organizationIds:[""],siteIds:["site"]}},
    ];
    for(const candidate of cases)expect(studentSiteScope(candidate)).toBeNull();
    const {grantSiteId:_,...noOriginalGrant}=actor;
    expect(studentSiteScope(noOriginalGrant)).toBeNull();
  });
  it("requires the actual Person, student role and read capability",()=>{
    for(const candidate of [
      {...actor,actorPersonId:null},
      {...actor,role:"learner"},
      {...actor,role:"guardian"},
      {...actor,capabilities:new Set<string>()},
    ])expect(studentSiteScope(candidate)).toBeNull();
  });
});
