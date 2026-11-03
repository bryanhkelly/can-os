import { describe, expect, it } from "vitest";
import { launchGradeRangeIsOrdered } from "@/domain/launch-grade-range";
import {
  physicalSiteAddressSchema,
  siteTimezoneSchema,
  draftSiteContactSchema,
  hasEnteredSiteAddress,
  nextSiteConfigurationRevision,
  samePhysicalSiteAddress,
  sameDraftSiteContact,
} from "@/domain/site-setup-configuration";

describe("canonical church Site configuration input",()=>{
  const address={street1:"100 Main Street",city:"Oakland",state:"CA",
    postalCode:"94612",country:"US"};
  it("normalizes and validates a complete Site address",()=>{
    expect(physicalSiteAddressSchema.parse({...address,street1:"  100 Main Street  "})).toMatchObject(address);
    expect(physicalSiteAddressSchema.safeParse({...address,city:""}).success).toBe(false);
    expect(physicalSiteAddressSchema.safeParse({...address,unexpected:"not allowed"}).success).toBe(false);
  });
  it("does not confuse an empty optional-address step with a partial location",()=>{
    expect(hasEnteredSiteAddress({street1:"",city:"",state:"",postalCode:"",country:"US"})).toBe(false);
    expect(hasEnteredSiteAddress({street1:"",city:"",state:"FL",postalCode:"",country:"US"})).toBe(true);
  });
  it("keeps school contact drafts validated and distinct from public approval",()=>{
    expect(draftSiteContactSchema.parse({
      displayName:"School Office",email:"office@example.org",phone:"",website:"",
    }).email).toBe("office@example.org");
    expect(draftSiteContactSchema.safeParse({
      displayName:"School Office",email:"invalid",phone:"",website:"",
    }).success).toBe(false);
  });
  it("requires an explicit real time zone and does not pretend that state identifies it",()=>{
    expect(siteTimezoneSchema.safeParse("America/Los_Angeles").success).toBe(true);
    expect(siteTimezoneSchema.safeParse("America/New_York").success).toBe(true);
    expect(siteTimezoneSchema.safeParse("Unrecognized/Time_Zone").success).toBe(false);
    expect(siteTimezoneSchema.safeParse("").success).toBe(false);
  });
  it("rejects a reversed school grade range and allows Sunday-capable learning models",()=>{
    expect(launchGradeRangeIsOrdered({min:"TK",max:"12"})).toBe(true);
    expect(launchGradeRangeIsOrdered({min:"12",max:"K"})).toBe(false);
    expect(launchGradeRangeIsOrdered({min:"9",max:"12"})).toBe(true);
  });
  it("replays identical configuration updates regardless of JSONB field order",()=>{
    expect(samePhysicalSiteAddress(
      {country:"US",postalCode:"94612",state:"CA",city:"Oakland",street1:"100 Main Street"},
      {street1:"100 Main Street",city:"Oakland",state:"CA",postalCode:"94612",country:"US"},
    )).toBe(true);
    expect(samePhysicalSiteAddress(
      {country:"US",postalCode:"94612",state:"CA",city:"Oakland",street1:"100 Main Street"},
      {street1:"100 Main Street",city:"Oakland",state:"NV",postalCode:"94612",country:"US"},
    )).toBe(false);
    expect(sameDraftSiteContact(
      {website:"",phone:"",email:"office@example.org",displayName:"School Office"},
      {displayName:"School Office",email:"office@example.org",phone:"",website:""},
    )).toBe(true);
  });
  it("advances Site revision even when two mutations share one millisecond",()=>{
    const previous=new Date("2026-11-03T18:00:00.000Z");
    const current=nextSiteConfigurationRevision(previous,new Date(previous));
    expect(current.toISOString()).toBe("2026-11-03T18:00:00.001Z");
    expect(nextSiteConfigurationRevision(current,new Date(previous)).getTime()).toBeGreaterThan(current.getTime());
  });
});
