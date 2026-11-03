import {describe,expect,it} from "vitest";
import {
  publicBioConsentSchema,publicBioSignature,
  projectConsentedPublicSitePerson,readPublicBioConsent,
} from "@/domain/public-site-people";

const consent={
  version:1 as const,
  siteId:"c2de6c0a-b48a-4578-9be7-7498546ef197",
  displayName:"Principal Example",publicTitle:"Head of School",
  biography:"An educator with extensive experience serving local families.",
  consentedAt:"2026-11-01T12:00:00.000Z",expiresOn:"2027-11-01",
};
describe("Site staff public identity consent",()=>{
  it("publishes only the person's exact authorized identity and biography",()=>{
    expect(publicBioConsentSchema.safeParse(consent).success).toBe(true);
    const approved={signature:publicBioSignature(consent)};
    expect(projectConsentedPublicSitePerson(consent,approved)).toEqual({
      displayName:consent.displayName,publicTitle:consent.publicTitle,
      biography:consent.biography,
    });
    expect(projectConsentedPublicSitePerson({...consent,biography:consent.biography+" changed"},approved))
      .toBeNull();
  });
  it("withdraws expired, other-site and removed consent",()=>{
    expect(readPublicBioConsent({publicBioConsents:[consent]},consent.siteId,
      new Date("2028-01-01T00:00:00.000Z"))).toBeNull();
    expect(readPublicBioConsent({publicBioConsents:[consent]},
      "2d664976-83df-489b-8199-65afc5f078b0",
      new Date("2026-11-03T00:00:00Z"))).toBeNull();
    expect(projectConsentedPublicSitePerson(null,{signature:publicBioSignature(consent)}))
      .toBeNull();
  });
});
