import {
  assertAuthorizedReportFacts,
  rollupAuthorizedParticipation,
  type ParticipationReportingFact,
  type ReportingScopeProof,
} from "./participation-rollups";

/**
 * Read-only annual impact reconciliation. Callers obtain source records from
 * authoritative services under current Site/Organization grants. This module
 * does not grant access, infer attendance, or create a second evidence ledger.
 */
export type ImpactEvidenceReference = {
  source: ParticipationReportingFact["source"];
  sourceId: string;
};
export type AttendanceEvidence = {
  id: string;
  participation: ImpactEvidenceReference;
  sessionId: string;
  observedAt: string;
  revision: number;
  status: "present" | "absent" | "unknown";
};
export type CompletionEvidence = {
  id: string;
  participation: ImpactEvidenceReference;
  decidedAt: string;
  revision: number;
  status: "completed" | "not_completed" | "revoked";
  verified: boolean;
};
export type AwardEvidence = {
  id: string;
  participation: ImpactEvidenceReference;
  completionDecisionId: string;
  issuedAt: string;
  revokedAt: string | null;
};
export type ImpactSourceBundle = {
  participations: readonly ParticipationReportingFact[];
  attendance: readonly AttendanceEvidence[];
  completions: readonly CompletionEvidence[];
  awards: readonly AwardEvidence[];
};
export type ImpactTotals = {
  registrations: number;
  distinctPeople: number;
  withdrawals: number;
  verifiedAttendanceOccurrences: number;
  verifiedAttendees: number;
  verifiedCompletions: number;
  awardsIssued: number;
  awardsCurrentlyValid: number;
  awardsRevoked: number;
};
export type ImpactSnapshot = {
  period: {from: string; to: string; asOf: string};
  totals: ImpactTotals;
  bySite: readonly {siteId: string; registrations: number; distinctPeople: number}[];
};
const key = (r: ImpactEvidenceReference) => r.source + ":" + r.sourceId;
const millis = (value: string) => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid evidence timestamp");
  return result;
};
const assertUnique = <T extends {id: string}>(rows: readonly T[], name: string) => {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error("Duplicate or absent " + name + " ID");
    ids.add(row.id);
  }
};
export function reconcileAnnualImpact(
  evidence: ImpactSourceBundle,
  proof: ReportingScopeProof,
  period: ImpactSnapshot["period"],
  expected?: ImpactSnapshot,
): ImpactSnapshot {
  assertAuthorizedReportFacts(evidence.participations, proof);
  const source = rollupAuthorizedParticipation(evidence.participations, proof, period);
  const from = millis(period.from), to = millis(period.to), asOf = millis(period.asOf);
  if (from >= to || from > asOf) throw new Error("Invalid impact period");
  const inPeriod = (at: string) => {
    const t = millis(at);
    return t >= from && t < to && t <= asOf;
  };
  const throughAsOf = (at: string) => millis(at) <= asOf;
  assertUnique(evidence.attendance, "attendance assertion");
  assertUnique(evidence.completions, "completion decision");
  assertUnique(evidence.awards, "award");

  const bySource = new Map(evidence.participations.map(p => [key(p), p]));
  const requireSource = (ref: ImpactEvidenceReference, evidenceAt: string) => {
    const participation = bySource.get(key(ref));
    if (!participation) throw new Error("Evidence references missing or unauthorized participation");
    if (millis(evidenceAt) < millis(participation.registeredAt))
      throw new Error("Evidence predates canonical participation");
    return participation;
  };

  // One room/session and participation pair contributes at most one corrected
  // attendance occurrence. A repeat Class registration is never silently merged.
  const latestAttendance = new Map<string, AttendanceEvidence>();
  for (const row of evidence.attendance) {
    requireSource(row.participation, row.observedAt);
    if (!row.sessionId || !Number.isInteger(row.revision) || row.revision < 1)
      throw new Error("Attendance requires session identity and valid revision");
    if (!throughAsOf(row.observedAt)) continue;
    const identity = key(row.participation) + ":" + row.sessionId;
    const previous = latestAttendance.get(identity);
    if (!previous || row.revision > previous.revision) latestAttendance.set(identity, row);
    else if (row.revision === previous.revision)
      throw new Error("Conflicting attendance revision");
  }
  const present = [...latestAttendance.values()].filter(r => r.status === "present" && inPeriod(r.observedAt));
  const attendees = new Set(present.map(r => bySource.get(key(r.participation))!.personId));

  const latestCompletion = new Map<string, CompletionEvidence>();
  for (const decision of evidence.completions) {
    requireSource(decision.participation, decision.decidedAt);
    if (!Number.isInteger(decision.revision) || decision.revision < 1)
      throw new Error("Invalid completion revision");
    if (!throughAsOf(decision.decidedAt)) continue;
    const identity = key(decision.participation);
    const previous = latestCompletion.get(identity);
    if (!previous || decision.revision > previous.revision) latestCompletion.set(identity, decision);
    else if (decision.revision === previous.revision)
      throw new Error("Conflicting completion revision");
  }
  const validCompletion = [...latestCompletion.values()].filter(d =>
    d.verified && d.status === "completed");
  const completionById = new Map(validCompletion.map(d => [d.id, d]));

  const issued = evidence.awards.filter(a => {
    requireSource(a.participation, a.issuedAt);
    if (a.revokedAt && millis(a.revokedAt) < millis(a.issuedAt))
      throw new Error("Award revocation predates issuance");
    // Even a historically issued award must reference an actual completion
    // decision for the SAME original participation.
    const linkedDecision = evidence.completions.find(d => d.id === a.completionDecisionId);
    if (!linkedDecision || key(linkedDecision.participation) !== key(a.participation) ||
        millis(linkedDecision.decidedAt) > millis(a.issuedAt))
      throw new Error("Award lacks same-participation completion provenance");
    return inPeriod(a.issuedAt);
  });
  const validAwards = issued.filter(a => {
    const decision = completionById.get(a.completionDecisionId);
    return !!decision && (!a.revokedAt || !throughAsOf(a.revokedAt));
  });
  const snapshot: ImpactSnapshot = {
    period: {...period},
    totals: {
      registrations: source.totals.registrations,
      distinctPeople: source.totals.uniquePeople,
      withdrawals: source.totals.withdrawn,
      verifiedAttendanceOccurrences: present.length,
      verifiedAttendees: attendees.size,
      verifiedCompletions: validCompletion.filter(d => inPeriod(d.decidedAt)).length,
      awardsIssued: issued.length,
      awardsCurrentlyValid: validAwards.length,
      awardsRevoked: evidence.awards.filter(a => a.revokedAt && inPeriod(a.revokedAt)).length,
    },
    bySite: source.sites.map(s => ({
      siteId: s.id, registrations: s.registrations, distinctPeople: s.uniquePeople,
    })),
  };
  if (expected) {
    if (JSON.stringify(expected.period) !== JSON.stringify(snapshot.period))
      throw new Error("Annual impact reconciliation period mismatch");
    for (const name of Object.keys(snapshot.totals) as (keyof ImpactTotals)[]) {
      if (expected.totals[name] !== snapshot.totals[name])
        throw new Error("Annual impact total mismatch: " + name);
    }
    const sites = new Map(snapshot.bySite.map(s => [s.siteId, s]));
    if (expected.bySite.length !== sites.size || expected.bySite.some(s => {
      const actual = sites.get(s.siteId);
      return !actual || actual.registrations !== s.registrations ||
        actual.distinctPeople !== s.distinctPeople;
    })) throw new Error("Annual impact Site reconciliation mismatch");
  }
  return snapshot;
}
