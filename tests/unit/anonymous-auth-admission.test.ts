import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state=vi.hoisted(()=>({
 commands:[] as unknown[],
 rows:[{allowed:true,retryAfterSeconds:38}] as Array<{allowed?:unknown;retryAfterSeconds?:unknown}>,
 unavailable:false,
}));
vi.mock("@/db/client",()=>({db:{
 execute:async (command:unknown)=>{
  state.commands.push(command);
  if(state.unavailable)throw new Error("secret database detail");
  return {rows:state.rows};
 },
}}));

import {
 AUTH_ADMISSION_POLICY,
 AUTH_ADMISSION_WINDOW_SECONDS,
 AuthAdmissionUnavailableError,
 admitAnonymousAuthRequest,
 anonymousAuthAdmissionResponse,
 decideAuthAdmissionRow,
} from "@/modules/identity/anonymous-auth-admission.server";

beforeEach(()=>{
 state.commands=[];
 state.rows=[{allowed:true,retryAfterSeconds:38}];
 state.unavailable=false;
});

describe("global anonymous admission safety ceiling",()=>{
 it("executes atomic capped upsert keyed only by trusted endpoint, not client-supplied headers",async()=>{
  expect(await admitAnonymousAuthRequest("verify")).toEqual({allowed:true,retryAfterSeconds:0});
  const parsed=new PgDialect().sqlToQuery(state.commands[0] as SQL);
  expect(parsed.sql).toContain("ON CONFLICT (route) DO UPDATE SET");
  expect(parsed.sql).toContain("LEAST(bucket.request_count + 1");
  expect(parsed.sql).toContain("interval '60 seconds'");
  expect(parsed.sql).toContain("RETURNING");
  expect(parsed.params).toContain("verify");
  expect(parsed.params).toContain(AUTH_ADMISSION_POLICY.verify);
  expect(parsed.params).toContain(AUTH_ADMISSION_POLICY.verify+1);
  expect(parsed.sql).not.toMatch(/forwarded|ip_address|cookie|email_normalized/);
  expect(AUTH_ADMISSION_WINDOW_SECONDS).toBe(60);
 });
 it("does not allow credential parsing beyond an exhausted budget",async()=>{
  state.rows=[{allowed:false,retryAfterSeconds:27}];
  const blocked=await admitAnonymousAuthRequest("request");
  expect(blocked).toEqual({allowed:false,retryAfterSeconds:27});
  const response=anonymousAuthAdmissionResponse(blocked);
  expect(response?.status).toBe(429);
  expect(response?.headers.get("Retry-After")).toBe("27");
  expect(response?.headers.get("Cache-Control")).toBe("no-store");
  expect(anonymousAuthAdmissionResponse({allowed:true,retryAfterSeconds:0})).toBeNull();
 });
 it("bounds Retry-After values even if database data is unexpected",()=>{
  expect(decideAuthAdmissionRow({allowed:false,retryAfterSeconds:0}).retryAfterSeconds).toBe(1);
  expect(decideAuthAdmissionRow({allowed:false,retryAfterSeconds:9999}).retryAfterSeconds).toBe(60);
  expect(decideAuthAdmissionRow({allowed:false,retryAfterSeconds:null}).retryAfterSeconds).toBe(60);
 });
 it("fails closed if the counter table is unavailable or returns an invalid shape",async()=>{
  state.rows=[];
  await expect(admitAnonymousAuthRequest("request")).rejects.toBeInstanceOf(AuthAdmissionUnavailableError);
  state.unavailable=true;
  await expect(admitAnonymousAuthRequest("verify")).rejects.toBeInstanceOf(AuthAdmissionUnavailableError);
 });
});
