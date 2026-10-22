import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state=vi.hoisted(()=>({
  writes:[] as Record<string,unknown>[],
  filters:[] as SQL[],
  rows:[{id:"session-1"}] as {id:string}[],
}));
vi.mock("@/db/client",()=>({
  db:{update:()=>{
    const query={
      set:(value:Record<string,unknown>)=>{state.writes.push(value);return query;},
      where:(value:SQL)=>{state.filters.push(value);return query;},
      returning:async()=>state.rows,
    };
    return query;
  }},
}));

import { recordMeaningfulSessionActivity } from "@/modules/identity/passwordless-access.server";

beforeEach(()=>{
  state.writes=[];
  state.filters=[];
  state.rows=[{id:"session-1"}];
});

describe("explicit activity refreshes only a live authenticated session",()=>{
  it("uses a conditional server update checking account, revocation and both deadlines",async()=>{
    await recordMeaningfulSessionActivity("session-1","account-1");
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.updatedAt).toBeInstanceOf(Date);
    expect(state.filters).toHaveLength(1);
    const statement=new PgDialect().sqlToQuery(state.filters[0]!);
    expect(statement.sql).toContain("revoked_at");
    expect(statement.sql).toContain("expires_at");
    expect(statement.sql).toContain("updated_at");
    expect(statement.params).toContain("session-1");
    expect(statement.params).toContain("account-1");
    const dates=statement.params.map(value=>
      typeof value==="string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) :
      value instanceof Date ? value : null,
    ).filter((value):value is Date=>value instanceof Date);
    expect(dates).toHaveLength(2);
    expect(dates[0]!.getTime()-dates[1]!.getTime()).toBe(30*60*1000);
  });
  it("cannot revive an expired, idle or revoked session when the database refuses the update",async()=>{
    state.rows=[];
    await expect(recordMeaningfulSessionActivity("session-1","account-1"))
      .rejects.toThrow("Session expired or revoked");
  });
});
