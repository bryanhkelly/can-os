import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { accessSessionCookie } from "@/domain/access-tokens";
import { canLearningCookieMode } from "@/domain/can-learning-cookie-boundary";

const can = "C".repeat(43);
const native = "N".repeat(43);
function request(...cookies:string[]) {
 return new Request("https://can.example/learn", {
   headers: cookies.length?{cookie:cookies.join("; ")}:{},
 });
}
const canCookie=`${accessSessionCookie}=${can}`;
const nativeCookie=`${canonicalSessionCookie}=${native}`;

describe("single CAN login is required for instructional learning",()=>{
 it("uses the CAN account without a second native credential",()=>{
  expect(canLearningCookieMode(request(canCookie))).toBe("can");
 });
 it("permits only a CAN-backed transitional native participation cookie",()=>{
  expect(canLearningCookieMode(request(canCookie,nativeCookie)))
   .toBe("can_with_native");
  expect(canLearningCookieMode(request(nativeCookie,canCookie)))
   .toBe("can_with_native");
 });
 it("never accepts native-only, missing, or forged CAN credentials",()=>{
  for(const cookies of [
    [],
    [nativeCookie],
    [`${accessSessionCookie}=`],
    [`${accessSessionCookie}=short`],
    [`${accessSessionCookie}_suffix=${can}`,nativeCookie],
  ]) expect(()=>canLearningCookieMode(request(...cookies))).toThrow();
 });
 it("never silently selects a duplicate or invalid native bearer",()=>{
  for(const cookies of [
    [canCookie,canCookie],
    [canCookie,nativeCookie,nativeCookie],
    [canCookie,`${canonicalSessionCookie}=short`],
    [canCookie,`${canonicalSessionCookie}=`],
    [canCookie,`${accessSessionCookie}=short`],
  ]) expect(()=>canLearningCookieMode(request(...cookies))).toThrow();
 });
 it("enforces the same boundary for identity and learning-session persistence",()=>{
  const source=readFileSync("src/modules/identity/learning-command-context.server.ts","utf8");
  expect(source.match(/canLearningCookieMode\(request\)/g)?.length).toBe(2);
  expect(source).toContain('=== "can_with_native"');
  expect(source).toContain("getCanonicalCommandContext(request)");
  expect(source).toContain("getCanonicalSessionRow(request)");
  expect(source).toContain("context.actorPersonId !== row.person_id");
  expect(source).not.toContain("projectCanonicalCommandContext(row)");
  expect(source).not.toContain("canonicalSessionDigestFromRequest");
  expect(source).not.toContain("issueNativeLearnerSession");
 });
 it("blocks native-only learner access across canonical Class commands",()=>{
  const source=readFileSync("src/modules/identity/canonical-command-context.server.ts","utf8");
  expect(source).toContain('if (legacy.role_code === "learner")');
  expect(source).toContain('throw new AuthorizationError("current CAN learner login required")');
  expect(source).toContain('return projectCanonicalCommandContext(legacy)');
  expect(source).not.toContain('return projectCanonicalCommandContext(await getCanonicalSessionRow(request))');
  // Independently scoped non-learner native reviewers are not silently
  // converted into unverified CAN organization grants by this change.
 });
});
