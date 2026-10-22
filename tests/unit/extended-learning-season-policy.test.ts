import { describe, expect, it } from "vitest";
import { assertExtendedSeasonDraft } from "@/domain/extended-learning-season-policy";

const base = {
  type: "after_school_enrichment" as const, status: "launching",
  creditIssuingOrganizationId: null, siteId: "host-site",
  startsOn: "2027-01-12", endsOn: "2027-05-20", capacity: 24,
};

describe("Extended-learning draft-season planning", () => {
  it("allows a noncredit hosted summer or after-school season", () => {
    expect(() => assertExtendedSeasonDraft(base)).not.toThrow();
    expect(() => assertExtendedSeasonDraft({...base, type:"summer_enrichment"})).not.toThrow();
    expect(() => assertExtendedSeasonDraft({...base, type:"summer_program"})).not.toThrow();
  });
  it("rejects ordinary school and credit-bearing summer programs", () => {
    expect(() => assertExtendedSeasonDraft({...base, type:"high_school_extension"})).toThrow(/extended-learning/);
    expect(() => assertExtendedSeasonDraft({...base, creditIssuingOrganizationId:"issuer"})).toThrow(/Credit-bearing/);
  });
  it("blocks closed, paused and siteless programs", () => {
    expect(() => assertExtendedSeasonDraft({...base, status:"closed"})).toThrow(/open for planning/);
    expect(() => assertExtendedSeasonDraft({...base, status:"paused"})).toThrow(/open for planning/);
    expect(() => assertExtendedSeasonDraft({...base, siteId:null})).toThrow(/requires a Site/);
  });
  it("rejects invalid dates, reverse windows and invalid capacity", () => {
    expect(() => assertExtendedSeasonDraft({...base, startsOn:"2027-02-30"})).toThrow(/Invalid start date/);
    expect(() => assertExtendedSeasonDraft({...base, endsOn:"2026-12-31"})).toThrow(/must not precede/);
    expect(() => assertExtendedSeasonDraft({...base, capacity:0})).toThrow(/capacity/);
    expect(() => assertExtendedSeasonDraft({...base, capacity:1.5})).toThrow(/capacity/);
  });
});
