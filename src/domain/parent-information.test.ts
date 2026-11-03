import { describe, expect, it } from "vitest";
import {
  parentClaimAudienceSchema, parentClaimStatusSchema, plannedPublicClaim,
  projectApprovedParentInformation, publicClaimSchema, unconfiguredClaim,
  verifiedPublicClaim,
} from "./parent-information";

const base = {
  site: { name: "Oakwood Academy", organizationName: "Oakwood Church" },
  academicPrograms: [],
  localContent: null,
  offerings: [],
} as const;

describe("PX parent public information contract", () => {
  it("exposes only approved Site identity and never guesses tuition or authorization", () => {
    const profile = projectApprovedParentInformation(base);
    expect(profile.site.name.value).toBe("Oakwood Academy");
    expect(profile.site.name.canDisplay).toBe(true);
    expect(profile.site.address.canDisplay).toBe(false);
    expect(profile.tuition.description.value).toBeNull();
    expect(profile.admissions.applicationOpen).toBe(false);
    expect(profile.disclosures.every(item => !item.statement.canDisplay)).toBe(true);
    expect(profile.schoolDay.days.value).toBeNull();
  });

  it("makes planned information non-displayable, even with a value", () => {
    expect(plannedPublicClaim("Possible bus service", "institutional_record")).toMatchObject({
      status: "planned", canDisplay: false,
    });
    expect(unconfiguredClaim("calendar")).toMatchObject({
      value: null, status: "not_configured", canDisplay: false,
    });
  });

  it("rejects display eligibility without an approved public source", () => {
    const schema = publicClaimSchema(parentClaimStatusSchema);
    expect(schema.safeParse({
      value: "verified", source: null, revision: null, audience: "public",
      status: "verified", canDisplay: true,
    }).success).toBe(false);
    expect(schema.safeParse({
      ...verifiedPublicClaim("verified", "organization_site"),
      audience: "internal",
    }).success).toBe(false);
    expect(parentClaimAudienceSchema.safeParse("anonymous_private").success).toBe(false);
  });

  it("projects reviewed programs without disclosing transaction/internal identifiers", () => {
    const profile = projectApprovedParentInformation({
      ...base,
      academicPrograms: [{
        programId: "protected-program-key",
        title: "Elementary Academy",
        summary: "Approved program summary",
        typeLabel: "Church-hosted academy",
        grades: { min: "K", max: "5" },
        delivery: { onsite: true, asynchronous: false, liveOnline: false, onsiteDaysPerWeek: 2 },
        availability: "planned" as const,
        applicationOpen: true,
      }],
      offerings: [{
        title: "Robotics Club", season: "Spring",
        startsOn: "2027-03-01", endsOn: "2027-05-01",
        registrationOpen: false,
      }],
    });
    expect(profile.academics[0]?.availability).toBe("planned");
    expect(profile.admissions.applicationOpen).toBe(false);
    expect(profile.activities[0]?.registrationOpen).toBe(false);
    expect(JSON.stringify(profile)).not.toContain("protected-program-key");
    expect(JSON.stringify(profile)).not.toContain("programId");
  });
});
