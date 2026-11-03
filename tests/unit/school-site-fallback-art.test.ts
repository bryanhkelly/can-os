import {describe,expect,it} from "vitest";
import {canFallbackArtwork,canFallbackFamilyForPalette,canFallbackFamilies,
  canFallbackSlots,canSchoolFallbackCollection} from "@/domain/school-site-fallback-art";

describe("original CAN School Sites fallback illustrations",()=>{
  it("provides 24 branded, stable, non-remote image assets",()=>{
    expect(canSchoolFallbackCollection).toHaveLength(24);
    expect(new Set(canSchoolFallbackCollection.map(x=>x.id)).size).toBe(24);
    for(const family of canFallbackFamilies)for(const slot of canFallbackSlots){
      const asset=canFallbackArtwork(family,slot);
      expect(asset.id).toBe(`can-original-${family}-${slot}-v1`);
      expect(asset.src.startsWith("data:image/svg+xml,")).toBe(true);
      const svg=decodeURIComponent(asset.src.slice("data:image/svg+xml,".length));
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toMatch(/<script|<foreignObject|<image|https?:\/\//);
      expect(svg).not.toContain("onload=");
      expect(asset.alt).toContain("not a photograph");
      expect(asset.src).toBe(canFallbackArtwork(family,slot).src);
    }
  });
  it("selects brand-coherent art families without input from untrusted source CSS",()=>{
    expect(canFallbackFamilyForPalette("heritage")).toBe("heritage");
    expect(canFallbackFamilyForPalette("forest")).toBe("natural");
    expect(canFallbackFamilyForPalette("harbor")).toBe("harbor");
    expect(canFallbackFamilyForPalette("signature")).toBe("heritage");
    expect(canFallbackFamilyForPalette("url(https://example.test/evil)")).toBe("heritage");
  });
});
