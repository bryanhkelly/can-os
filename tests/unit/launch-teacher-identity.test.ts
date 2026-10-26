import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { evaluateLaunchTeacher, launchTeacherRolePredicate } from "@/modules/staffing/launch-staffing.server";

const state=vi.hoisted(()=>({rows:[] as unknown[][],select:vi.fn(),claims:vi.fn()}));
vi.mock("@/db/client",()=>({db:{
  select:()=>state.select(),selectDistinctOn:()=>state.claims(),
}}));
vi.mock("@/platform/mutation",()=>({writeAudit:vi.fn(),emitEvent:vi.fn(),notify:vi.fn()}));
const chain=()=>({
  from(){return this;},innerJoin(){return this;},leftJoin(){return this;},
  where(){return this;},orderBy(){return this;},
  async limit(){return state.rows.shift()??[];},
  then(resolve:(value:unknown[])=>unknown,reject:(error:unknown)=>unknown){
    return Promise.resolve(state.rows.shift()??[]).then(resolve,reject);
  },
});
beforeEach(()=>{
  vi.clearAllMocks();state.select.mockImplementation(chain);state.claims.mockImplementation(chain);
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
      expect(query.sql).toContain('"is_synthetic"');
      expect(query.sql).toContain('"disabled"');
      expect(query.sql).toContain('"role_assignments"."person_id"');
      expect(query.params).toContain(providerId);
    });
});
