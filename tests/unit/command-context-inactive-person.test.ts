import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { hashAccessSecret, accessSessionCookie } from "@/domain/access-tokens";

const state=vi.hoisted(()=>({
  rows:[] as unknown[][],
  filters:[] as SQL[],
}));
vi.mock("@/db/client",()=>({
  db:{select:()=>{
    const rows=state.rows.shift()??[];
    const query={
      from:()=>query,
      innerJoin:()=>query,
      where:(where:SQL)=>{state.filters.push(where);return query;},
      limit:()=>Promise.resolve(rows),
      then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve(rows).then(resolve,reject),
    };
    return query;
  }},
}));
vi.mock("@/modules/identity/demo-facilitator.server",()=>({
  listDemoFacilitatorGrants:vi.fn(),
}));

describe("server session must enforce active-person memberships",()=>{
  const pepper="unit-tests-only-pepper-must-be-at-least-32-characters";
  beforeEach(()=>{
    state.rows=[];
    state.filters=[];
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER",pepper);
  });
  it("denies a valid, unrevoked session when its only person is deactivated",async()=>{
    const secret="a".repeat(43);
    state.rows=[
      [{id:"session-1",accountId:"regular-account",activeGrantId:"grant-1"}],
      // The database must reject this otherwise active grant because people.active=false.
      [],
    ];
    await expect(getCommandContext(new Request("https://can-os.example/school",{
      headers:{cookie:`${accessSessionCookie}=${secret}`},
    }))).rejects.toThrow("active membership");
    const sql=new PgDialect();
    expect(state.filters).toHaveLength(2);
    const sessionPredicate=sql.sqlToQuery(state.filters[0]!);
    expect(sessionPredicate.sql).toContain("updated_at");
    const dates=sessionPredicate.params.map(value=>
      typeof value==="string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) :
      value instanceof Date ? value : null,
    ).filter((value):value is Date=>value instanceof Date);
    expect(dates).toHaveLength(2); // absolute expiration and idle cutoff
    expect(dates[0]!.getTime()-dates[1]!.getTime()).toBe(30*60*1000);
    const query=sql.sqlToQuery(state.filters[1]!);
    expect(query.params).toEqual(["regular-account",true,true]);
    expect(query.sql).toContain("people");
    expect(query.sql).toContain("active");
    expect(hashAccessSecret(secret,pepper)).toMatch(/^[a-f0-9]{64}$/);
  });
});
