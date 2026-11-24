import { describe, expect, it } from "vitest";
import { encodeUuidForPath } from "@/domain/opaque-url-id";
import { resolveGoTargetInput } from "@/domain/go-target-input";

const id = "550e8400-e29b-41d4-a716-446655440000";
const compact = encodeUuidForPath(id);
const app = "https://app.example.com";
describe("Go destination target input", () => {
  it.each(["class","adult-training","enrichment"] as const)(
    "accepts canonical and compact %s identifiers",kind=>{
      expect(resolveGoTargetInput(kind,id)).toBe(id);
      expect(resolveGoTargetInput(kind,compact)).toBe(id);
    });
  it("accepts an exact local Class link or same-origin copied URL",()=>{
    expect(resolveGoTargetInput("class","/class/"+compact)).toBe(id);
    expect(resolveGoTargetInput("class",app+"/class/"+compact,app)).toBe(id);
    expect(resolveGoTargetInput("class","/class?classId="+compact)).toBe(id);
  });
  it("accepts named release and enrichment internal link paths",()=>{
    expect(resolveGoTargetInput("adult-training","/learn/enroll?release="+compact)).toBe(id);
    expect(resolveGoTargetInput("enrichment","/enrichment/"+compact)).toBe(id);
    expect(resolveGoTargetInput("adult-training",app+"/learn/enroll?release="+compact,app)).toBe(id);
  });
  it("rejects arbitrary sites, ambiguous selectors, traversal and mismatched paths",()=>{
    for(const text of [
      "https://evil.example.com/class/"+compact,
      "//evil.example.com/class/"+compact,
      "/class?classId="+compact+"&classId="+compact,
      "/class/../"+compact,
      "/class/"+compact+"?next=/admin",
      "/class/"+compact+"#admin",
      "/class//"+compact,
      "/class/short",
      "javascript:alert(1)",
    ]) {
      expect(resolveGoTargetInput("class",text,app),text).toBeNull();
    }
    expect(resolveGoTargetInput("class","/enrichment/"+compact)).toBeNull();
    expect(resolveGoTargetInput("enrichment","/class/"+compact)).toBeNull();
  });
});
