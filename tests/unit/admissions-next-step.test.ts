import { describe, expect, it } from "vitest";
import { admissionsProgress, type AdmissionsProgressInput } from "@/domain/admissions-next-step";
import { schoolYearServesProgram } from "@/domain/admissions-seat-pool";

const now = new Date("2026-05-01T00:00:00Z");
const base: AdmissionsProgressInput = {
  stage: "application", disposition: null, submitted: true, journeyStarted: false,
  guardianVerified: false, guardianLoginProvisioned: false, outstandingRequirements: 0,
  offers: [], activeEnrollments: 0, placedSections: 0,
};

describe("admissionsProgress", () => {
  it("asks the family to submit an unsubmitted draft first", () => {
    expect(admissionsProgress({ ...base, stage: "inquiry", submitted: false }, now).next?.key).toBe("submit");
  });

  it("starts the registrar at eligibility review after submission", () => {
    const progress = admissionsProgress(base, now);
    expect(progress.status).toBe("in_progress");
    expect(progress.next).toMatchObject({ key: "eligibility", owner: "registrar" });
  });

  it("walks through guardian verification, provisioning and requirements", () => {
    const review = { ...base, stage: "eligibility", journeyStarted: true, outstandingRequirements: 2 };
    expect(admissionsProgress(review, now).next?.key).toBe("verify-guardian");
    expect(admissionsProgress({ ...review, guardianVerified: true }, now).next?.key).toBe("provision-guardian");
    const provisioned = { ...review, guardianVerified: true, guardianLoginProvisioned: true };
    expect(admissionsProgress(provisioned, now).next?.key).toBe("requirements");
    expect(admissionsProgress({ ...provisioned, outstandingRequirements: 0 }, now).next?.key).toBe("approve");
    expect(admissionsProgress({ ...provisioned, outstandingRequirements: 0, disposition: "ready_for_offer" }, now).next?.key).toBe("issue-offer");
  });

  it("waits for the family on a live offer and ignores expired offers", () => {
    const ready = { ...base, stage: "eligibility", journeyStarted: true, guardianVerified: true, guardianLoginProvisioned: true, disposition: "ready_for_offer" };
    const issued = { id: "offer", status: "issued", expiresAt: "2026-05-10T00:00:00Z", schoolYearId: "year" };
    expect(admissionsProgress({ ...ready, offers: [issued] }, now).next).toMatchObject({ key: "family-accepts", owner: "family" });
    expect(admissionsProgress({ ...ready, offers: [{ ...issued, expiresAt: "2026-04-01T00:00:00Z" }] }, now).next?.key).toBe("issue-offer");
  });

  it("finishes with activation and course placement", () => {
    const accepted = { ...base, stage: "accepted", journeyStarted: true, guardianVerified: true, guardianLoginProvisioned: true,
      offers: [{ id: "offer", status: "accepted", expiresAt: null, schoolYearId: "year" }] };
    expect(admissionsProgress(accepted, now).next?.key).toBe("activate");
    expect(admissionsProgress({ ...accepted, activeEnrollments: 1 }, now).next?.key).toBe("place");
    const complete = admissionsProgress({ ...accepted, activeEnrollments: 1, placedSections: 2 }, now);
    expect(complete).toMatchObject({ status: "complete", next: null });
  });

  it("reports closed and waitlisted applications explicitly", () => {
    expect(admissionsProgress({ ...base, stage: "declined" }, now)).toMatchObject({ status: "closed", next: null });
    expect(admissionsProgress({ ...base, stage: "eligibility", disposition: "waitlisted" }, now).status).toBe("waitlisted");
  });
});

describe("schoolYearServesProgram", () => {
  const program = { organizationId: "org", siteId: "site", id: "program" };
  it("accepts the host site calendar and program-specific years in scope", () => {
    expect(schoolYearServesProgram({ organizationId: "org", siteId: "site", programId: null }, program)).toBe(true);
    expect(schoolYearServesProgram({ organizationId: "org", siteId: "site", programId: "program" }, program)).toBe(true);
  });
  it("rejects organization-wide years and years from another organization, site or program", () => {
    expect(schoolYearServesProgram({ organizationId: "org", siteId: null, programId: null }, program)).toBe(false);
    expect(schoolYearServesProgram({ organizationId: "other", siteId: "site", programId: null }, program)).toBe(false);
    expect(schoolYearServesProgram({ organizationId: "org", siteId: "elsewhere", programId: null }, program)).toBe(false);
    expect(schoolYearServesProgram({ organizationId: "org", siteId: "site", programId: "other" }, program)).toBe(false);
  });
});
