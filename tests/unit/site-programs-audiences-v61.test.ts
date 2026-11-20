import { describe, expect, it } from "vitest";
import {
  applySiteProgramsAudiencesV61, emptySiteProgramsAudiencesV61,
  readSiteProgramsAudiencesV61, siteLaunchPreferencesSchema,
  siteProgramsAudiencesV61Schema,
} from "@/domain/site-launch-preferences";
import { applySiteEnvironmentDeliveryV61 } from "@/domain/site-information-v61";

describe("V6.1 private Site planning", () => {
  const plan = {
    interestIds: ["grades-9-12", "senior"] as const,
    timingIds: ["weekdays", "daytime", "weekends"] as const,
    audienceIds: ["teens", "older_adults"] as const,
    startingFocus: "grades-9-12" as const,
  };
  it("supports day schools and daytime older-adult learning independently of weekend/evening", () => {
    expect(siteProgramsAudiencesV61Schema.safeParse(plan).success).toBe(true);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...plan, interestIds: ["senior"], startingFocus: "senior",
      timingIds: ["weekdays", "daytime"],
    }).success).toBe(true);
  });
  it("keeps audience intent separate from enrollment eligibility", () => {
    expect(siteProgramsAudiencesV61Schema.parse(plan)).toEqual(plan);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...plan, programId: "not-an-offering", enrollmentOpen: true,
    }).success).toBe(false);
  });
  it("normalizes stored legacy weekend/evening interests without altering source on read", () => {
    const stored = { delivery: "physical", interestIds: ["grades-9-12", "weekend", "evening"] };
    expect(readSiteProgramsAudiencesV61(stored)).toEqual({
      interestIds: ["grades-9-12"], timingIds: ["weekends", "evenings"],
      audienceIds: [], startingFocus: null,
    });
    expect(stored.interestIds).toEqual(["grades-9-12", "weekend", "evening"]);
  });
  it("combines V2 timing and legacy flags without duplicates", () => {
    expect(readSiteProgramsAudiencesV61({
      delivery: "both", interestIds: ["adult", "weekend"],
      timingIds: ["weekends", "daytime"], audienceIds: ["adults"],
      startingFocus: "adult", planningVersion: 2,
    }).timingIds).toEqual(["weekends", "daytime"]);
  });
  it("updates the same Site record, preserving the latest delivery and normalizing codes", () => {
    const previous = { delivery: "digital", interestIds: ["adult", "weekend"] };
    const updated = applySiteProgramsAudiencesV61(previous, siteProgramsAudiencesV61Schema.parse(plan));
    expect(updated).toEqual({
      delivery: "digital", planningVersion: 2,
      interestIds: ["grades-9-12", "senior"],
      timingIds: ["weekdays", "daytime", "weekends"],
      audienceIds: ["teens", "older_adults"],
      startingFocus: "grades-9-12",
    });
    expect(siteLaunchPreferencesSchema.safeParse(updated).success).toBe(true);
  });
  it("uses the saved Learning Environment as the authority over stale legacy delivery", () => {
    const previous = { delivery: "digital", interestIds: ["adult"] };
    const updated = applySiteProgramsAudiencesV61(previous,
      siteProgramsAudiencesV61Schema.parse(plan), "physical");
    expect(updated.delivery).toBe("physical");
    expect(updated.interestIds).toEqual(["grades-9-12", "senior"]);
  });
  it("keeps the richer plan when Site Information updates delivery", () => {
    const previous = applySiteProgramsAudiencesV61({ delivery: "physical", interestIds: [] },
      siteProgramsAudiencesV61Schema.parse(plan));
    expect(applySiteEnvironmentDeliveryV61(previous, {
      delivery: "digital", physicalSpaceArrangement: "",
    })).toEqual({ ...previous, delivery: "digital" });
  });
  it("refuses stale/malformed/unknown source rather than silently blanking it", () => {
    expect(() => readSiteProgramsAudiencesV61({
      delivery: "physical", interestIds: ["unknown"]
    })).toThrow();
    expect(() => applySiteProgramsAudiencesV61({delivery:"not-real",interestIds:[]},
      emptySiteProgramsAudiencesV61())).toThrow();
    expect(() => applySiteProgramsAudiencesV61(null, emptySiteProgramsAudiencesV61())).toThrow(
      /Site Information/);
  });
  it("rejects duplicate choices and invalid starting focus", () => {
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...plan, timingIds: ["daytime", "daytime"],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...plan, audienceIds: ["adults", "adults"],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...plan, interestIds: ["senior"], startingFocus: "grades-9-12",
    }).success).toBe(false);
  });
  it("keeps canonical Program references as private intent, separate from Offerings", () => {
    const withPrograms = siteProgramsAudiencesV61Schema.parse({
      ...plan,
      programCodes: ["can.program.custom_training", "can.program.ai_digital_skills"],
      startingProgramCode: "can.program.custom_training",
    });
    const saved = applySiteProgramsAudiencesV61({ delivery: "physical", interestIds: [] }, withPrograms);
    expect(saved.programCodes).toEqual(withPrograms.programCodes);
    expect(saved.startingProgramCode).toBe("can.program.custom_training");
    expect(readSiteProgramsAudiencesV61(saved)).toEqual(withPrograms);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...withPrograms, programCodes: ["can.program.custom_training", "can.program.custom_training"],
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...withPrograms, startingProgramCode: "can.program.unknown",
    }).success).toBe(false);
    expect(siteProgramsAudiencesV61Schema.safeParse({
      ...withPrograms, offeringId: "unapproved-offering",
    }).success).toBe(false);
  });

  it("opens as an entirely optional planning form for new Sites", () => {
    expect(readSiteProgramsAudiencesV61(null)).toEqual(emptySiteProgramsAudiencesV61());
  });
});
