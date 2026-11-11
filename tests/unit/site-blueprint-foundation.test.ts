import { describe, expect, it } from "vitest";
import {
  assertConceptContactLimit, blueprintCanAppearAsLiveOffering,
  blueprintWeeklyPeriodSchema, siteBlueprintIdentitySchema,
  siteBlueprintItemDraftSchema, siteBlueprintProgramDraftSchema,
} from "@/domain/school-blueprint";

describe("Site-owned School Blueprint planning contracts", () => {
  it("allows a nonsectarian school inside a religious hosting organization's Site", () => {
    expect(siteBlueprintIdentitySchema.parse({
      religiousAffiliationCode: "nonsectarian",
      editorialIdentity: "innovation_discovery",
      culturalContext: { languages: ["English", "Spanish"] },
    })).toMatchObject({ religiousAffiliationCode: "nonsectarian" });
  });
  it("does not silently assume a religious identity", () => {
    expect(siteBlueprintIdentitySchema.parse({
      religiousAffiliationCode: null,
      editorialIdentity: "community_belonging",
    }).religiousAffiliationCode).toBeNull();
  });
  it("permits a draft Program without an academic issuer or official enrollment", () => {
    expect(siteBlueprintProgramDraftSchema.parse({
      name: "Saturday Academy", kind: "weekend", gradeRange: { min: "6", max: "12" },
    }).name).toBe("Saturday Academy");
  });
  it("keeps an Add Your Own experience and CAN catalog references separate", () => {
    expect(siteBlueprintItemDraftSchema.parse({
      kind: "experience", title: "Local Oral History Project",
    }).catalogVersionId).toBeUndefined();
  });
  it("rejects invalid weekly local times and weekdays", () => {
    expect(blueprintWeeklyPeriodSchema.safeParse({
      dayOfWeek: 2, startsAtLocal: "15:00", endsAtLocal: "08:00",
      kind: "instruction", label: "Invalid",
    }).success).toBe(false);
    expect(blueprintWeeklyPeriodSchema.safeParse({
      dayOfWeek: 7, startsAtLocal: "08:00", endsAtLocal: "12:00",
      kind: "support", label: "Invalid",
    }).success).toBe(false);
  });
  it("keeps every planning status off public-facing operational surfaces", () => {
    for (const status of ["draft","in_review","ready_to_convert","linked","retired"])
      expect(blueprintCanAppearAsLiveOffering(status)).toBe(false);
  });
  it("enforces the ten-contact concept cap while allowing a recipient resend", () => {
    expect(() => assertConceptContactLimit(10,false)).toThrow(/ten distinct adult contacts/);
    expect(() => assertConceptContactLimit(10,true)).not.toThrow();
    expect(() => assertConceptContactLimit(9,false)).not.toThrow();
  });
});
