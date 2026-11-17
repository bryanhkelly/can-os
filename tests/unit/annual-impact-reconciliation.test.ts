import {describe,expect,it} from "vitest";
import {reconcileAnnualImpact,type ImpactSourceBundle} from "@/domain/annual-impact-reconciliation";

const proof = {
  verifiedOrganizationIds: new Set(["org"]),
  verifiedSiteIds: new Set(["siteA", "siteB"]),
};
const period = {
  from: "2026-01-01T00:00:00Z",
  to: "2027-01-01T00:00:00Z",
  asOf: "2027-01-02T00:00:00Z",
};
const participation = (sourceId: string, personId: string, site: string, status = "active") => ({
  source: "native_class_enrollment" as const,
  sourceId, personId, deliverySiteId: site, operatingOrganizationId: "org",
  creditedOrganizationId: null, courseVersionId: "course", programId: "program",
  registeredAt: "2026-02-01T00:00:00Z", currentStatus: status,
});
const ref = (sourceId: string) => ({source: "native_class_enrollment" as const, sourceId});
const makeEvidence = (): ImpactSourceBundle => ({
  participations: [
    participation("e1", "person1", "siteA"),
    participation("e2", "person1", "siteB", "withdrawn"),
    participation("e3", "person2", "siteB"),
  ],
  attendance: [
    {id: "a1", participation: ref("e1"), sessionId: "s1", observedAt: "2026-03-01T00:00:00Z", revision: 1, status: "present"},
    {id: "a2", participation: ref("e1"), sessionId: "s1", observedAt: "2026-03-02T00:00:00Z", revision: 2, status: "absent"},
    {id: "a3", participation: ref("e2"), sessionId: "s2", observedAt: "2026-03-01T00:00:00Z", revision: 1, status: "present"},
  ],
  completions: [
    {id: "c1", participation: ref("e1"), decidedAt: "2026-04-01T00:00:00Z", revision: 1, status: "completed", verified: true},
    {id: "c2", participation: ref("e2"), decidedAt: "2026-04-01T00:00:00Z", revision: 1, status: "completed", verified: true},
    {id: "c3", participation: ref("e2"), decidedAt: "2026-04-02T00:00:00Z", revision: 2, status: "revoked", verified: true},
  ],
  awards: [
    {id: "w1", participation: ref("e1"), completionDecisionId: "c1", issuedAt: "2026-05-01T00:00:00Z", revokedAt: null},
    {id: "w2", participation: ref("e2"), completionDecisionId: "c2", issuedAt: "2026-05-01T00:00:00Z", revokedAt: "2026-06-01T00:00:00Z"},
  ],
});
describe("annual impact reconciliation", () => {
  it("reconciles repeat participation, corrected attendance, withdrawals, reversed completions and awards", () => {
    const result = reconcileAnnualImpact(makeEvidence(), proof, period);
    expect(result.totals).toEqual({
      registrations: 3, distinctPeople: 2, withdrawals: 1,
      verifiedAttendanceOccurrences: 1, verifiedAttendees: 1,
      verifiedCompletions: 1, awardsIssued: 2, awardsCurrentlyValid: 1, awardsRevoked: 1,
    });
    expect(result.bySite.map(x => x.registrations)).toEqual([1, 2]);
    expect(result.bySite.reduce((sum, site) => sum + site.distinctPeople, 0)).toBe(3);
    expect(result.totals.distinctPeople).toBe(2);
  });
  it("rejects invented annual numbers, even when Site totals match", () => {
    const evidence = makeEvidence();
    const correct = reconcileAnnualImpact(evidence, proof, period);
    expect(() => reconcileAnnualImpact(evidence, proof, period, {
      ...correct, totals: {...correct.totals, distinctPeople: 3},
    })).toThrow("distinctPeople");
  });
  it("rejects unauthorized Site evidence and orphan evidence", () => {
    const evidence = makeEvidence();
    expect(() => reconcileAnnualImpact({
      ...evidence, participations: [participation("foreign", "p", "anotherSite")],
    }, proof, period)).toThrow("Out-of-scope");
    expect(() => reconcileAnnualImpact({
      ...evidence, attendance: [
        ...evidence.attendance,
        {id: "orphan", participation: ref("missing"), sessionId: "s3",
          observedAt: "2026-04-01T00:00:00Z", revision: 1, status: "present"},
      ],
    }, proof, period)).toThrow("missing or unauthorized");
  });
  it("rejects an award credited to a different person's completion", () => {
    const evidence = makeEvidence();
    expect(() => reconcileAnnualImpact({
      ...evidence,
      awards: [{id: "invalid", participation: ref("e2"), completionDecisionId: "c1",
        issuedAt: "2026-05-01T00:00:00Z", revokedAt: null}],
    }, proof, period)).toThrow("same-participation");
  });
  it("rejects conflicting attendance revisions and duplicate evidence IDs", () => {
    const evidence = makeEvidence();
    expect(() => reconcileAnnualImpact({
      ...evidence,
      attendance: [...evidence.attendance, {
        id: "a4", participation: ref("e1"), sessionId: "s1",
        observedAt: "2026-03-03T00:00:00Z", revision: 2, status: "present",
      }],
    }, proof, period)).toThrow("Conflicting attendance");
    expect(() => reconcileAnnualImpact({
      ...evidence, awards: [...evidence.awards, evidence.awards[0]!],
    }, proof, period)).toThrow("Duplicate or absent award");
  });
});
