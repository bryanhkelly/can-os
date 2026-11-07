import { describe, expect, it } from "vitest";
import { addressStateJurisdiction, launchSiteJurisdictionIssue, siteJurisdictionLocation } from "@/domain/site-jurisdiction-default";

const jurisdictions=[
  {id:"tx",name:"Texas",code:"US-TX"},
  {id:"fl",name:"Florida",code:"FL"},
];
describe("school Site address jurisdiction",()=>{
  it("resolves explicit state abbreviations and full state names",()=>{
    expect(addressStateJurisdiction({country:"US",state:"TX"},jurisdictions)).toBe("tx");
    expect(addressStateJurisdiction({country:"US",state:"Florida"},jurisdictions)).toBe("fl");
    expect(addressStateJurisdiction({country:"US",regionCode:"US-TX"},jurisdictions)).toBe("tx");
  });
  it("uses Site planning state until a full physical address is recorded",()=>{
    const california={id:"ca",name:"California",code:"US-CA"};
    const location=siteJurisdictionLocation(null,{state:"CA"});
    expect(addressStateJurisdiction(location,[california])).toBe("ca");
    expect(launchSiteJurisdictionIssue(location,[california],"ca")).toBeNull();
    expect(siteJurisdictionLocation({country:"US",state:"TX"},{state:"CA"})).toMatchObject({state:"TX"});
  });
  it("does not guess a state from a timezone or unknown address",()=>{
    expect(addressStateJurisdiction({timezone:"America/New_York"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({state:"Unknown"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({state:"TX"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({country:"CA",state:"TX"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction(null,jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({country:"CA",state:"Texas"},jurisdictions)).toBeNull();
  });
  it("names unsupported states without adopting a synthetic jurisdiction",()=>{
    const synthetic={id:"synthetic",name:"Synthetic California",code:"SYNTH-CA-2026"};
    const issue=launchSiteJurisdictionIssue({country:"US",state:"CA"},[synthetic],"synthetic");
    expect(issue).toMatchObject({code:"LAUNCH_LOCATION_UNSUPPORTED"});
    expect(issue?.message).toContain("School setup for California isn't available yet");
    expect(issue?.message).toContain("save a draft");
    expect(issue?.message).toContain("don't choose a different state");
    expect(launchSiteJurisdictionIssue({country:"US",state:"California"},[],"")?.code).toBe("LAUNCH_LOCATION_UNSUPPORTED");
  });
  it("explains a mismatched state and permits a matching choice",()=>{
    expect(launchSiteJurisdictionIssue({country:"US",state:"TX"},jurisdictions,"fl"))
      .toMatchObject({code:"LAUNCH_LOCATION_MISMATCH",message:expect.stringContaining("Choose Texas")});
    expect(launchSiteJurisdictionIssue({country:"US",state:"TX"},jurisdictions,"tx")).toBeNull();
    expect(launchSiteJurisdictionIssue({country:"US",state:"TX"},jurisdictions,"")).toBeNull();
    expect(launchSiteJurisdictionIssue({country:"CA",state:"TX"},jurisdictions,"fl")).toBeNull();
    expect(launchSiteJurisdictionIssue({state:"CA"},[],"")).toBeNull();
  });
});
