import {describe,it,expect} from "vitest";
import {geographyEntitySchema,privateGeography,assignablePersonalArea,requireEntityGeographyConsent} from "@/domain/entity-geography";
import {entityGeographyRoles} from "@/domain/geographic-intelligence";
const entityId="11111111-1111-4111-8111-111111111111";
describe("universal entity geography",()=>{
 it("validates every entity/role pairing",()=>{
  for(const [entityKind,roles] of Object.entries(entityGeographyRoles))for(const role of roles)
   expect(geographyEntitySchema.safeParse({entityKind,entityId,role}).success).toBe(true);
  expect(geographyEntitySchema.safeParse({entityKind:"person",entityId,role:"delivery"}).success).toBe(false);
 });
 it("keeps Site delivery derived and private geography consent gated",()=>{
  const site=geographyEntitySchema.parse({entityKind:"site",entityId,role:"physical_delivery"});
  expect(()=>requireEntityGeographyConsent(site,true)).toThrow();
  for(const entity of [{entityKind:"person",entityId,role:"residence"},{entityKind:"learning_activity",entityId,role:"participation"}]){
   const parsed=geographyEntitySchema.parse(entity);expect(privateGeography(parsed)).toBe(true);
   expect(()=>requireEntityGeographyConsent(parsed,false)).toThrow();expect(()=>requireEntityGeographyConsent(parsed,true)).not.toThrow();
  }
  expect(assignablePersonalArea("metro")).toBe(true);expect(assignablePersonalArea("tract")).toBe(false);
  expect(assignablePersonalArea("school_district")).toBe(false);
 });
});
