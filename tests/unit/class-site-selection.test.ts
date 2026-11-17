import { describe, expect, it } from "vitest";
import { selectAuthorizedClassSite } from "@/domain/class-site-selection";

const allowed=[
  {id:"site-a",allowedDeliveryModes:["facilitated","live"]},
  {id:"site-b",allowedDeliveryModes:["self_paced"]},
] as const;

describe("native /class Site selection",()=>{
  it("respects the preferred Site only when the authorized Course offers its mode",()=>{
    expect(selectAuthorizedClassSite(allowed,"site-a","facilitated")).toBe("site-a");
    expect(selectAuthorizedClassSite(allowed,"site-a","self_paced")).toBe("");
  });
  it("never falls back to another organization's Site",()=>{
    expect(selectAuthorizedClassSite(allowed,"site-c","facilitated")).toBe("");
    expect(selectAuthorizedClassSite(allowed,null,"facilitated")).toBe("");
  });
  it("retains a manually selected Site only when compatible",()=>{
    expect(selectAuthorizedClassSite(allowed,"site-b","self_paced")).toBe("site-b");
    expect(selectAuthorizedClassSite(allowed,"site-b","live")).toBe("");
  });
});
