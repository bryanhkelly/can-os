import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { evaluateLaunchTeacher, launchTeacherRolePredicate } from "@/modules/staffing/launch-staffing.server";

const state=vi.hoisted(()=>({rows:[] as unknown[][],select:vi.fn(),claims:vi.fn(),whereClauses:[] as unknown[]}));
vi.mock("@/db/client",()=>({db:{
  select:()=>state.select(),selectDistinctOn:()=>state.claims(),
}}));
vi.mock("@/platform/mutation",()=>({writeAudit:vi.fn(),emitEvent:vi.fn(),notify:vi.fn()}));
const chain=()=>({
  from(){return this;},innerJoin(){return this;},leftJoin(){return this;},
  where(predicate:unknown){state.whereClauses.push(predicate);return this;},orderBy(){return this;},
  async limit(){return state.rows.shift()??[];},
  then(resolve:(value:unknown[])=>unknown,reject:(error:unknown)=>unknown){
    return Promise.resolve(state.rows.shift()??[]).then(resolve,reject);
  },
});
beforeEach(()=>{
  vi.clearAllMocks();state.whereClauses=[];state.select.mockImplementation(chain);state.claims.mockImplementation(chain);
  state.rows=[[{
    id:"section",programId:"program",siteId:"site",active:true,
    organizationId:"church",providerId:"can",programSiteId:"site",
    yearOrganizationId:"church",yearSiteId:"site",yearProgramId:"program",
    startsAt:new Date("2030-01-01"),endsAt:new Date("2030-06-01"),
    startsOn:"2030-01-01",endsOn:"2030-06-01",timezone:"UTC",
  }],[]];
});
describe("launch teacher identity prerequisite",()=>{
  it("rejects missing usable role/account authority before loading private qualification claims",async()=>{
    const result=await evaluateLaunchTeacher("section","teacher");
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("active verified account");
    expect(state.select).toHaveBeenCalledTimes(2);
    expect(state.claims).not.toHaveBeenCalled();
  });
  it("still requires qualification policy after teacher identity passes",async()=>{
    state.rows[1]=[{id:"provider-role"}];state.rows.push([],[]);
    const result=await evaluateLaunchTeacher("section","teacher");
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toContain("policy not configured");
    expect(state.claims).toHaveBeenCalledOnce();
  });
  it.each([["church","can"],["school","school"]])(
    "includes the shared verified account predicate for %s / %s", (organizationId,providerId)=>{
      const predicate=launchTeacherRolePredicate({
        organizationId,providerId,programId:"program",siteId:"site",
      }) as SQL;
      const query=new PgDialect().sqlToQuery(predicate);
      expect(query.sql).toContain('exists (');
      expect(query.sql).toContain('"email_verified_at" is not null');
      expect(query.sql).not.toContain('"is_synthetic"');
      expect(query.sql).toContain('"active"');
      expect(query.sql).toContain('"disabled"');
      expect(query.sql).toContain('"role_assignments"."person_id"');
      expect(query.params).toContain(providerId);
    });
});

import { evaluateTeachingEligibility } from "@/modules/staffing/teaching-eligibility.server";
import { db } from "@/db/client";
import { teachingEvaluationWindow } from "@/modules/staffing/teaching-evaluation-window";

describe("explicit teaching qualification horizons",()=>{
  function evidence(expiresAt=new Date("2030-06-01"),decision="approve"){
    state.rows[1]=[{id:"provider-role"}];
    state.rows.push([{
      id:"rule",code:"license",expression:{op:"credential",type:"license"},evidencePolicy:{},
      versionFrom:new Date("2029-01-01"),versionThrough:new Date("2032-01-01"),
      appliesFrom:null,appliesThrough:null,
    }],[{
      id:"claim",type:"license",issuer:null,jurisdiction:null,issuedAt:new Date("2029-01-01"),
      expiresAt,decision,verificationEventId:"latest-review",
    }]);
  }
  const evaluate=(horizon:"current"|"instructional_window",now="2030-03-01")=>
    evaluateTeachingEligibility("section","teacher",db,{
      horizon,now:new Date(now),requireAssignment:false,
    });
  it("accepts current coverage while rejecting a credential that expires before term end",async()=>{
    evidence(new Date("2030-04-01"));
    const rows=structuredClone(state.rows);
    const current=await evaluate("current");
    expect(current.eligible).toBe(true);
    expect(current.evaluatedWindow.from.toISOString()).toBe("2030-03-01T00:00:00.000Z");
    state.rows=rows;
    expect((await evaluate("instructional_window")).eligible).toBe(false);
  });
  it("does not hide expiration by clamping post-term access to the last instructional day",async()=>{
    evidence();
    const rows=structuredClone(state.rows);
    expect((await evaluate("instructional_window","2030-07-01")).eligible).toBe(true);
    state.rows=rows;
    expect((await evaluate("current","2030-07-01")).eligible).toBe(false);
  });
  it("uses actual pre-term time rather than accepting a not-yet-valid credential",async()=>{
    evidence();
    (state.rows[3]![0] as Record<string,unknown>).issuedAt=new Date("2030-01-01");
    expect((await evaluate("current","2029-12-01")).eligible).toBe(false);
  });
  it.each(["current","instructional_window"] as const)("rejects revoked evidence for %s",async horizon=>{
    evidence(undefined,"revoke");
    expect((await evaluate(horizon)).eligible).toBe(false);
  });
  it("requires the assignment when requested without reading private claims",async()=>{
    const result=await evaluateTeachingEligibility("section","teacher",db,{
      horizon:"current",requireAssignment:true,now:new Date("2030-03-01"),
    });
    expect(result.eligible).toBe(false);expect(result.reasons[0]).toContain("assigned teacher");
    expect(state.claims).not.toHaveBeenCalled();
  });
  it("limits the required assignment read to teacher-role rows",async()=>{
    const result=await evaluateTeachingEligibility("section","teacher",db,{
      horizon:"current",requireAssignment:true,now:new Date("2030-03-01"),
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("assigned teacher");
    const query=new PgDialect().sqlToQuery(state.whereClauses[1] as SQL);
    expect(query.sql).toContain('"section_teachers"."section_id"');
    expect(query.sql).toContain('"section_teachers"."person_id"');
    expect(query.sql).toContain('"section_teachers"."role"');
    expect(query.params).toEqual(["section","teacher","teacher"]);
  });
  it("accepts an explicitly required matching assignment before evaluating qualifications",async()=>{
    evidence();state.rows.splice(1,0,[{id:"assignment"}]);
    const result=await evaluateTeachingEligibility("section","teacher",db,{
      horizon:"current",requireAssignment:true,now:new Date("2030-03-01"),
    });
    expect(result.eligible).toBe(true);
  });
  it("rejects inactive sections before role or qualification reads",async()=>{
    (state.rows[0]![0] as Record<string,unknown>).active=false;
    expect((await evaluate("current")).eligible).toBe(false);
    expect(state.select).toHaveBeenCalledTimes(1);
  });
  it("keeps launch Site requirements while allowing scoped site-less evaluation",async()=>{
    const section=state.rows[0]![0] as Record<string,unknown>;
    section.siteId=null;section.programSiteId=null;section.yearSiteId=null;
    evidence();
    const rows=structuredClone(state.rows);
    await expect(evaluateLaunchTeacher("section","teacher")).rejects.toThrow("requires a school site");
    state.rows=rows;
    expect((await evaluate("current")).eligible).toBe(true);
  });
  it("rejects an invalid current time or unsupported horizon",()=>{
    const instruction={from:new Date("2030-01-01"),through:new Date("2030-06-01")};
    expect(()=>teachingEvaluationWindow(instruction,"current",new Date("invalid"))).toThrow();
    expect(()=>teachingEvaluationWindow(instruction,"unexpected" as "current",new Date())).toThrow();
  });
});
