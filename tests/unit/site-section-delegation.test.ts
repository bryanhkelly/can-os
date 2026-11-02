import { describe, expect, it } from "vitest";
import {
  isEffectiveSectionFacilitator, sectionFacilitatorKey,
} from "@/domain/site-section-delegation";

const section = "11111111-1111-4111-8111-111111111111";
const person = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-23T15:00:00.000Z");
const named = {
  sectionId: section, personId: person, roleKey: "room_facilitator",
  responsiblePersonId: person, grantPersonId: person,
  grantSiteId: "site-a", siteId: "site-a",
  grantOrganizationId: "church-a", organizationId: "church-a",
  accountVerified: true, accountActive: true, personActive: true,
  effectiveFrom: new Date("2026-10-22T12:00:00.000Z"),
  effectiveThrough: new Date("2026-11-22T12:00:00.000Z"),
};

describe("GF-B: Section-limited multiple local facilitators", () => {
  it("does not collapse multiple people into one Program-wide role", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    expect(sectionFacilitatorKey(section, person))
      .toBe(`room_facilitator:${section}:${person}`);
    expect(sectionFacilitatorKey(section, other))
      .not.toBe(sectionFacilitatorKey(section, person));
    expect(sectionFacilitatorKey(section.toUpperCase(), person.toUpperCase()))
      .toBe(sectionFacilitatorKey(section, person));
    expect(sectionFacilitatorKey(other, person))
      .not.toBe(sectionFacilitatorKey(section, person));
    expect(() => sectionFacilitatorKey("spoof", person)).toThrow();
  });

  it("only recognizes the matching verified Site, Person, role and time window", () => {
    expect(isEffectiveSectionFacilitator(named, now)).toBe(true);
    for (const variant of [
      { responsiblePersonId: "stranger" },
      { grantPersonId: "stranger" },
      { roleKey: "registrar" },
      { grantSiteId: "sibling-site" },
      { grantOrganizationId: "can-institution" },
      { accountVerified: false },
      { accountActive: false },
      { personActive: false },
      { effectiveFrom: new Date("2026-11-01T12:00:00Z") },
      { effectiveThrough: new Date("2026-10-01T12:00:00Z") },
      { effectiveThrough: null },
    ]) expect(isEffectiveSectionFacilitator({ ...named, ...variant }, now)).toBe(false);
  });
});
