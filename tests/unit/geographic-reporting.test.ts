import {describe,it,expect} from "vitest";
import {geographyFilterSchema,hasGeographyFilterOption} from "@/domain/geographic-reporting";
describe("governed geography filters",()=>{
 it("validates source-qualified geography codes and reserved states",()=>{
  for(const v of ["","US-GA","US-CBSA-12060","US-COUNTY-13067","US-CSA-122","US-REGION-SOUTH","market:unknown","market:outside"])expect(geographyFilterSchema.parse(v)).toBe(v);
  expect(geographyFilterSchema.safeParse("Atlanta").success).toBe(false);
  expect(geographyFilterSchema.safeParse("US-CBSA-12060' OR TRUE").success).toBe(false);
 });
 it("never treats an unavailable selection as all geographies",()=>{
  expect(hasGeographyFilterOption("US-CBSA-12060",[])).toBe(false);
  expect(hasGeographyFilterOption("market:unknown",[])).toBe(true);
 });
});
