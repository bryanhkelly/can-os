import { describe, expect, it } from "vitest";
import {
  emptySiteIdentityV61, isChurchSiteIdentityV61, isFaithBasedSiteIdentityV61,
  siteIdentityEditorialContextV61, siteIdentityV61Schema,
} from "./site-identity-v61";

describe("Site Information V6.1 self-described identity", () => {
  const secularSite = {
    siteType:"school_education",faithOrientation:"not_faith_based",faithTradition:"",
  } as const;
  const faithSchool = {
    siteType:"school_education",faithOrientation:"faith_based",faithTradition:"christian",
  } as const;
  it("requires an explicit Site type instead of guessing it from the host", () => {
    expect(emptySiteIdentityV61().siteType).toBe("");
    expect(siteIdentityV61Schema.safeParse(emptySiteIdentityV61()).success).toBe(false);
    expect(siteIdentityV61Schema.parse(secularSite)).toEqual(secularSite);
  });
  it("keeps school or nonprofit identity independent from faith orientation", () => {
    expect(siteIdentityV61Schema.parse(faithSchool)).toEqual(faithSchool);
    expect(isFaithBasedSiteIdentityV61(faithSchool)).toBe(true);
    expect(isChurchSiteIdentityV61(faithSchool)).toBe(false);
    const nonprofit = {
      siteType:"community_nonprofit",faithOrientation:"faith_based",faithTradition:"muslim",
    } as const;
    expect(siteIdentityV61Schema.safeParse(nonprofit).success).toBe(true);
    expect(siteIdentityEditorialContextV61(nonprofit).kind).toBe("community organization");
  });
  it("validates inherently faith-based categories without granting affiliation", () => {
    expect(siteIdentityV61Schema.safeParse({
      ...secularSite,siteType:"church_community",
    }).success).toBe(false);
    expect(siteIdentityV61Schema.safeParse({
      siteType:"church_community",faithOrientation:"faith_based",faithTradition:"",
    }).success).toBe(true);
    expect(isChurchSiteIdentityV61({
      siteType:"church_community",faithOrientation:"faith_based",faithTradition:"",
    })).toBe(true);
    expect(siteIdentityV61Schema.safeParse({
      ...faithSchool,networkApproved:true,
    }).success).toBe(false);
  });
  it("does not infer faith from a school or community classification", () => {
    expect(isFaithBasedSiteIdentityV61(secularSite)).toBe(false);
    expect(isFaithBasedSiteIdentityV61(null)).toBe(false);
    expect(siteIdentityEditorialContextV61(null).kind).toBe("learning community");
  });
});
