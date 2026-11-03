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
  readSitePhysicalAddress,
  siteAddressEditorDraft,
  launchOnsiteDaysPerWeekSchema,
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
  it("accepts US states, DC and supported territories; normalizes aliases and ZIP+4",()=>{
    expect(physicalSiteAddressSchema.parse({
      ...address,state:"District of Columbia",postalCode:"20001-1234",
      country:"United States",
    })).toMatchObject({country:"US",state:"DC",postalCode:"20001-1234"});
    expect(physicalSiteAddressSchema.parse({...address,state:"PR",postalCode:"00901"}).state).toBe("PR");
    expect(physicalSiteAddressSchema.parse({...address,state:"U.S. Virgin Islands",postalCode:"00801"}).state).toBe("VI");
    expect(physicalSiteAddressSchema.safeParse({...address,state:"Atlantis"}).success).toBe(false);
    expect(physicalSiteAddressSchema.safeParse({...address,postalCode:"946"}).success).toBe(false);
    expect(physicalSiteAddressSchema.safeParse({...address,postalCode:"H3A 1A1"}).success).toBe(false);
  });
  it("prevents US-Canada cross-border state/ZIP confusion while supporting non-US regions",()=>{
    const toronto={...address,state:"Ontario",postalCode:"M5V 2T6",country:"Canada"};
    expect(physicalSiteAddressSchema.parse(toronto)).toMatchObject({state:"ON",country:"CA"});
    expect(physicalSiteAddressSchema.safeParse({...toronto,state:"TX"}).success).toBe(false);
    expect(physicalSiteAddressSchema.safeParse({...toronto,postalCode:"94612"}).success).toBe(false);
    expect(physicalSiteAddressSchema.safeParse({...address,country:"CA",state:"CA"}).success).toBe(false);
    expect(physicalSiteAddressSchema.parse({...address,country:"GB",state:"England",postalCode:"SW1A 1AA"}).country).toBe("GB");
    expect(physicalSiteAddressSchema.safeParse({...address,country:"unknown country"}).success).toBe(false);
  });
  it("preserves optional county, normalizes whitespace, and marks old or invalid records",()=>{
    const valid=physicalSiteAddressSchema.parse({
      ...address,street1:" 100 Main Street ",county:" Alameda ",street2:"   ",
    });
    expect(valid.county).toBe("Alameda");
    expect(valid.street2).toBeUndefined();
    expect(readSitePhysicalAddress(valid).status).toBe("church_supplied");
    const legacy={line1:"100 Main Street",city:"Oakland",stateCode:"US-CA",zip:"94612",country:"USA"};
    expect(readSitePhysicalAddress(legacy)).toMatchObject({
      status:"legacy_needs_review",
      value:{street1:"100 Main Street",state:"CA",country:"US"},
    });
    expect(siteAddressEditorDraft(legacy)).toMatchObject({street1:"100 Main Street",postalCode:"94612"});
    expect(samePhysicalSiteAddress(legacy,address)).toBe(false);
    expect(readSitePhysicalAddress({street1:"100 Main Street",city:"Oakland",state:"??",postalCode:"",country:"US"}).status)
      .toBe("invalid_needs_correction");
    expect(readSitePhysicalAddress(null).status).toBe("missing");
  });
  it("accepts one through seven onsite days without automatically excluding Sunday",()=>{
    expect(launchOnsiteDaysPerWeekSchema.safeParse(7).success).toBe(true);
    expect(launchOnsiteDaysPerWeekSchema.safeParse(1).success).toBe(true);
    expect(launchOnsiteDaysPerWeekSchema.safeParse(0).success).toBe(false);
    expect(launchOnsiteDaysPerWeekSchema.safeParse(8).success).toBe(false);
    expect(launchOnsiteDaysPerWeekSchema.safeParse(2.5).success).toBe(false);
  });
  it("advances Site revision even when two mutations share one millisecond",()=>{
    const previous=new Date("2026-11-03T18:00:00.000Z");
    const current=nextSiteConfigurationRevision(previous,new Date(previous));
    expect(current.toISOString()).toBe("2026-11-03T18:00:00.001Z");
    expect(nextSiteConfigurationRevision(current,new Date(previous)).getTime()).toBeGreaterThan(current.getTime());
  });
});
