import {describe,it,expect} from "vitest";
import {issueOpaqueSecret,hashAccessSecret,equalSecretHashes,normalizeAccessEmail,accessChallengeIsUsable,accessSessionIsUsable,sessionCookieHeader,clearSessionCookieHeader,ACCESS_SESSION_IDLE_TIMEOUT_MS,sessionIdleCutoff,accessSessionIsWithinIdleWindow} from "@/domain/access-tokens";
const pepper="test-pepper-with-more-than-thirty-two-characters";
describe("passwordless access token primitives",()=>{
 it("generates unique opaque values and constant-time comparable hashes",()=>{
  const one=issueOpaqueSecret(),two=issueOpaqueSecret();
  expect(one).not.toBe(two);expect(one.length).toBeGreaterThan(40);
  const a=hashAccessSecret(one,pepper);
  expect(a).not.toContain(one);expect(equalSecretHashes(a,hashAccessSecret(one,pepper))).toBe(true);
  expect(equalSecretHashes(a,hashAccessSecret(two,pepper))).toBe(false);
 });
 it("requires pepper and normalizes addresses",()=>{
  expect(()=>hashAccessSecret("test","short")).toThrow();
  expect(normalizeAccessEmail("  Example@School.org ")).toBe("example@school.org");
  expect(()=>normalizeAccessEmail("not-an-email")).toThrow();
 });
 it("rejects consumed, expired and over-attempted challenges",()=>{
  const future=new Date(Date.now()+60_000),past=new Date(Date.now()-60_000);
  expect(accessChallengeIsUsable({expiresAt:future,consumedAt:null,attempts:4})).toBe(true);
  expect(accessChallengeIsUsable({expiresAt:past,consumedAt:null,attempts:0})).toBe(false);
  expect(accessChallengeIsUsable({expiresAt:future,consumedAt:new Date(),attempts:0})).toBe(false);
  expect(accessChallengeIsUsable({expiresAt:future,consumedAt:null,attempts:5})).toBe(false);
 });
 it("creates secure host-only cookies and rejects expired sessions",()=>{
  expect(sessionCookieHeader(issueOpaqueSecret())).toContain("HttpOnly; Secure; SameSite=Lax");
  expect(clearSessionCookieHeader()).toContain("Max-Age=0");
  expect(accessSessionIsUsable({expiresAt:new Date(Date.now()-1000),revokedAt:null,updatedAt:new Date()})).toBe(false);
  expect(accessSessionIsUsable({expiresAt:new Date(Date.now()+1000),revokedAt:new Date(),updatedAt:new Date()})).toBe(false);
 });
 it("does not accept an idle session past the server cutoff",()=>{
  const now=new Date("2026-10-22T12:00:00.000Z");
  const cutoff=sessionIdleCutoff(now);
  expect(ACCESS_SESSION_IDLE_TIMEOUT_MS).toBe(30*60*1000);
  expect(cutoff.toISOString()).toBe("2026-10-22T11:30:00.000Z");
  expect(accessSessionIsWithinIdleWindow(new Date("2026-10-22T11:30:00.001Z"),now)).toBe(true);
  expect(accessSessionIsWithinIdleWindow(cutoff,now)).toBe(false);
  expect(accessSessionIsWithinIdleWindow(new Date("2026-10-22T11:29:59.999Z"),now)).toBe(false);
  expect(accessSessionIsWithinIdleWindow(new Date("2026-10-22T12:00:00.001Z"),now)).toBe(false);
  expect(accessSessionIsUsable({
    expiresAt:new Date("2026-10-22T13:00:00Z"),
    revokedAt:null,updatedAt:new Date("2026-10-22T11:59:00Z"),
  },now)).toBe(true);
  expect(accessSessionIsUsable({
    expiresAt:new Date("2026-10-22T13:00:00Z"),
    revokedAt:null,updatedAt:cutoff,
  },now)).toBe(false);
 });

});