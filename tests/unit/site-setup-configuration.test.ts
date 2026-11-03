import { describe, expect, it } from "vitest";
import {
  physicalSiteAddressSchema,
  draftSiteContactSchema,
  hasEnteredSiteAddress,
  nextSiteConfigurationRevision,
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
  it("advances Site revision even when two mutations share one millisecond",()=>{
    const previous=new Date("2026-11-03T18:00:00.000Z");
    const current=nextSiteConfigurationRevision(previous,new Date(previous));
    expect(current.toISOString()).toBe("2026-11-03T18:00:00.001Z");
    expect(nextSiteConfigurationRevision(current,new Date(previous)).getTime()).toBeGreaterThan(current.getTime());
  });
});
