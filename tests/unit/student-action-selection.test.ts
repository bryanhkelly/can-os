import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getQuickWinActions, finishQuickWinAction } from "@/modules/actions/student-actions.functions";

const state=vi.hoisted(()=>({
  actor:{actorPersonId:"student-owner",scope:{siteIds:["authorized-site"],programIds:["authorized-program"]}},
  requireActor:vi.fn(),select:vi.fn(),where:vi.fn(),limit:vi.fn(),header:vi.fn(),update:vi.fn(),
  rows:[] as Record<string,unknown>[],
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({
    parse:(input:unknown)=>input,
    validator(parse:(input:unknown)=>unknown){this.parse=parse;return this;},
    handler(callback:(input:{data:unknown})=>unknown){
      return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
    },
  }),
}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:state.header}));
vi.mock("@/modules/identity/actors.server",()=>({
  requireActor:state.requireActor,
  actorSiteIds:(actor:typeof state.actor)=>actor.scope.siteIds,
  recordAudit:vi.fn(),
}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn()}));
vi.mock("@/db/client",()=>({db:{
  select:state.select,
  transaction:async(work:(tx:{select:typeof state.select;update:typeof state.update})=>unknown)=>
    work({select:state.select,update:state.update}),
}}));

beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("DATABASE_URL","mock-only");state.rows=[];
  state.requireActor.mockResolvedValue(state.actor);
  state.select.mockImplementation(()=>{
    const query={
      from:()=>query,where:(filter:unknown)=>{state.where(filter);return query;},
      orderBy:()=>query,for:()=>query,
      limit:async(count:number)=>{state.limit(count);return state.rows;},
    };
    return query;
  });
});
afterEach(()=>vi.unstubAllEnvs());
const actionId="00000000-0000-4000-8000-000000000001";
function selectedQuery(){
  return new PgDialect().sqlToQuery(state.where.mock.calls[0]![0]);
}

describe("exact student Action reads",()=>{
  it("selects the exact ID before the directory limit while retaining owner and delivery scope",async()=>{
    await getQuickWinActions({data:{actionId}});
    const query=selectedQuery();
    expect(query.sql).toContain('"actions"."id" =');
    expect(query.sql).toContain('"actions"."owner_person_id" =');
    expect(query.sql).toContain('"actions"."site_id" in');
    expect(query.sql).toContain('"actions"."program_id" in');
    expect(query.params).toEqual(["student-owner","authorized-site","authorized-program",actionId]);
    expect(state.limit).toHaveBeenCalledWith(1);
    expect(state.requireActor).toHaveBeenCalledWith(["student"]);
    expect(state.header).toHaveBeenCalledWith("Cache-Control","private, no-store");
  });
  it("retains the bounded directory contract for callers without a selection",async()=>{
    expect(await getQuickWinActions()).toEqual({connected:true,actions:[]});
    expect(selectedQuery().params).toEqual(["student-owner","authorized-site","authorized-program"]);
    expect(state.limit).toHaveBeenCalledWith(100);
  });
  it("returns an explicit empty result for an unavailable ID without a directory fallback",async()=>{
    expect(await getQuickWinActions({data:{actionId}})).toEqual({connected:true,actions:[]});
    expect(state.select).toHaveBeenCalledOnce();
    expect(state.limit).toHaveBeenCalledWith(1);
  });
  it("rejects malformed IDs before resolving identity or reading Actions",async()=>{
    await expect(getQuickWinActions({data:{actionId:"invalid"}})).rejects.toThrow();
    expect(state.requireActor).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
  });
  it("does not accept a caller-selected owner or scope",async()=>{
    await getQuickWinActions({data:{actionId,ownerPersonId:"foreign",siteIds:["foreign"]}});
    expect(selectedQuery().params).toEqual(["student-owner","authorized-site","authorized-program",actionId]);
  });
  it("propagates failed reads instead of treating them as empty detail",async()=>{
    state.select.mockImplementationOnce(()=>{throw new Error("Database unavailable");});
    await expect(getQuickWinActions({data:{actionId}})).rejects.toThrow("Database unavailable");
  });
});

describe("student Action completion boundary",()=>{
  it.each(["academic_intervention","support_referral","field_trip_consent"])("continues to deny generic completion for %s",async type=>{
    state.rows=[{id:actionId,type,programId:"authorized-program"}];
    await expect(finishQuickWinAction({data:{actionId}})).rejects.toThrow("owning workflow");
    expect(state.update).not.toHaveBeenCalled();
  });
});
