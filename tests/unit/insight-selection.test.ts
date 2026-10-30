import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { listInsights } from "@/modules/operations/insights.functions";

const state=vi.hoisted(()=>({where:vi.fn(),readScope:vi.fn(),select:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({
    parse:(input:unknown)=>input,
    validator(parse:(input:unknown)=>unknown){this.parse=parse;return this;},
    handler(callback:(input:{data:unknown})=>unknown){
      return async(input:{data:unknown})=>callback({data:this.parse(input.data)});
    },
  }),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost")}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>({
  actorPersonId:"staff",role:"registrar",capabilities:new Set(["insights:read"]),
  scope:{siteIds:["site"],programIds:["program"]},
})}));
vi.mock("@/platform/scope",()=>({readScope:state.readScope}));
vi.mock("@/modules/operations/insights.scope",()=>({assertInsightManageScope:vi.fn()}));
vi.mock("@/modules/actions/academic-action-policy.server",()=>({
  assertAcademicActionAuthority:vi.fn(),assertAcademicActionStaff:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{select:state.select}}));

beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("DATABASE_URL","mock-only");
  state.readScope.mockResolvedValue(sql`authorized_insight_scope`);
  state.select.mockImplementation(()=>{
    const query={
      from:()=>query,leftJoin:()=>query,
      where:(filter:unknown)=>{state.where(filter);return query;},
      orderBy:()=>query,limit:async()=>[],
    };
    return query;
  });
});
afterEach(()=>vi.unstubAllEnvs());

describe("exact insight selection",()=>{
  const insightId="00000000-0000-4000-8000-000000000001";
  it("filters by the exact ID under the same read scope, regardless of status",async()=>{
    expect(await listInsights({data:{insightId,status:"open"}})).toEqual({insights:[]});
    const query=new PgDialect().sqlToQuery(state.where.mock.calls[0][0]);
    expect(query.sql).toContain("authorized_insight_scope");
    expect(query.sql).toContain('"insights"."id" =');
    expect(query.params).toContain(insightId);
    expect(query.params).not.toContain("open");
  });
  it("keeps status filtering for the normal directory",async()=>{
    await listInsights({data:{status:"dismissed"}});
    const query=new PgDialect().sqlToQuery(state.where.mock.calls[0][0]);
    expect(query.sql).toContain("authorized_insight_scope");
    expect(query.params).toContain("dismissed");
  });
  it("rejects invalid IDs and propagates authorization failures rather than falling back",async()=>{
    await expect(listInsights({data:{insightId:"invalid"}})).rejects.toThrow();
    expect(state.select).not.toHaveBeenCalled();
    state.readScope.mockRejectedValueOnce(new Error("Denied"));
    await expect(listInsights({data:{insightId}})).rejects.toThrow("Denied");
    expect(state.select).not.toHaveBeenCalled();
  });
});
