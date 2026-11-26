import { describe, expect, it } from "vitest";
import {
  CENSUS_GEOGRAPHY_YEAR,
  classifyMarketStatus,
  marketArea,
  communityArea,
  type GeographicAreaFact,
  type GeographicResolution,
} from "@/domain/geographic-intelligence";

const county: GeographicAreaFact = { code: "US-COUNTY-13067", name: "Cobb", kind: "county", sourceId: "13067" };
const metro: GeographicAreaFact = { code: "US-CBSA-12060", name: "Atlanta", kind: "metro", sourceId: "12060" };
const micro: GeographicAreaFact = { code: "US-CBSA-12345", name: "Example", kind: "micro", sourceId: "12345" };

describe("canonical market evidence", () => {
  it("pins the released geographic dataset", () => {
    expect(CENSUS_GEOGRAPHY_YEAR).toBe(2024);
  });

  it("requires complete boundary evidence before declaring outside-market", () => {
    expect(classifyMarketStatus([county], false)).toBe("unknown");
    expect(classifyMarketStatus([county], true)).toBe("outside_market");
    expect(classifyMarketStatus([], false)).toBe("unknown");
    expect(classifyMarketStatus([], true)).toBe("outside_market");
  });

  it("retains positive market evidence regardless of empty-layer completeness", () => {
    expect(classifyMarketStatus([county, metro], false)).toBe("metro");
    expect(classifyMarketStatus([county, metro], true)).toBe("metro");
    expect(classifyMarketStatus([county, micro], false)).toBe("micro");
    expect(classifyMarketStatus([county, micro], true)).toBe("micro");
  });

  it("rejects ambiguous market evidence rather than choosing arbitrarily", () => {
    expect(() => classifyMarketStatus([metro, micro], true)).toThrow("geography_provider_ambiguous_market");
    expect(() => classifyMarketStatus([metro, metro], false)).toThrow("geography_provider_ambiguous_market");
  });

  it("uses a market first and otherwise a county for community context", () => {
    const result: GeographicResolution = {
      source: "us-census-geocoder", benchmark: "4", vintage: "424",
      latitude: 33.9, longitude: -84.5, areas: [county, metro], marketStatus: "metro",
    };
    expect(marketArea(result)).toBe(metro);
    expect(communityArea(result)).toBe(metro);
    expect(marketArea({ areas: [county] })).toBeNull();
    expect(communityArea({ ...result, areas: [county], marketStatus: "unknown" })).toBe(county);
    expect(communityArea({ ...result, areas: [], marketStatus: "unknown" })).toBeNull();
  });
});
