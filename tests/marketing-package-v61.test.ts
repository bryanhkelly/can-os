import { describe, expect, it } from "vitest";
import {
  initialMarketingContent, marketingPackageContentSchema, marketingStepIssue,
  marketingPurposeIds, marketingAudienceOptions, marketingFormatOptions,
  marketingPackageClaimsRequireReview,
} from "../src/domain/marketing-package-v61";

describe("V6.1 Marketing Packages", () => {
  it("starts every objective with editable, claim-safe copy", () => {
    for (const purpose of marketingPurposeIds) {
      const draft = initialMarketingContent("Barton Community Learning Center",purpose);
      expect(marketingPackageContentSchema.parse(draft)).toEqual(draft);
      expect(draft.purpose).toBe(purpose);
      expect(draft.audiences).toEqual([]);
      expect(draft.headline.length).toBeGreaterThan(0);
      expect(draft.message).toContain("Barton Community Learning Center");
      expect(draft.message.toLowerCase()).not.toMatch(/now enrolling|accredited|approved to operate/);
    }
  });
  it("recognizes each audience and collateral format", () => {
    expect(new Set(marketingAudienceOptions.map(o => o.id)).size).toBe(marketingAudienceOptions.length);
    expect(new Set(marketingFormatOptions.map(o => o.id)).size).toBe(marketingFormatOptions.length);
  });
  it("guides workflow completion without blocking partial draft saving", () => {
    const draft=initialMarketingContent("Barton","site-announcement");
    expect(marketingStepIssue("menu","",draft)).toBe("Name this package before continuing.");
    expect(marketingStepIssue("audience","Welcome",draft)).toBe("Select at least one audience.");
    expect(marketingStepIssue("messages","Welcome",{...draft,headline:""})).toBe("Add both a headline and a message.");
    expect(marketingStepIssue("assets","Welcome",{...draft,formats:[]})).toBe("Select at least one format.");
    expect(marketingStepIssue("menu","Welcome",draft)).toBe(null);
  });
  it("protects material-specific edits with the same claim scanner",()=>{
    const draft=initialMarketingContent("Barton","site-announcement");
    const changed=marketingPackageContentSchema.parse({
      ...draft,materialOverrides:{email:{headline:"New opportunity"}},
    });
    expect(changed.materialOverrides?.email?.headline).toBe("New opportunity");
    expect(marketingPackageClaimsRequireReview("Barton",{
      ...draft,materialOverrides:{email:{message:"Accredited school now enrolling"}},
    })).toBe(true);
  });
  it("does not accept unverified recipient lists, CTA URLs or brand overrides", () => {
    const draft=initialMarketingContent("Barton","site-announcement");
    expect(marketingPackageContentSchema.safeParse({...draft, recipients:["a@example.com"]}).success).toBe(false);
    expect(marketingPackageContentSchema.safeParse({...draft, callToActionUrl:"https://example.com"}).success).toBe(false);
    expect(marketingPackageContentSchema.safeParse({...draft, unknownBrand:{primary:"#123456"}}).success).toBe(false);
  });
});
