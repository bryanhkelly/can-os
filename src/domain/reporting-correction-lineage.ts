import { REPORTING_SOURCE_CONTRACT_VERSION } from "./reporting-source-contract";

type Scope = { organizationId: string; siteId: string; programId: string | null };
type Correction = {
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  sourceKind: string;
  sourceId: string;
  scope: Scope;
};
type PriorSource = {
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

/** A correction must point to the same canonical source and operating owner.
 * Never rely only on matching aggregate IDs: those do not grant Site access.
 */
export function assertReportingCorrectionLineage(
  correction: Correction,
  prior: PriorSource | null,
): void {
  if (!prior || prior.aggregateType !== correction.aggregateType ||
      prior.aggregateId !== correction.aggregateId ||
      !Number.isFinite(prior.occurredAt.getTime()) ||
      prior.occurredAt.getTime() > correction.occurredAt.getTime()) {
    throw new Error("Correction references an unrelated or future canonical source");
  }
  const raw = prior.payload.reporting;
  if (!raw || typeof raw !== "object") {
    throw new Error("Correction references a source without normalized reporting evidence");
  }
  const reporting = raw as {
    contractVersion?: unknown;
    occurredAt?: unknown;
    source?: { kind?: unknown; id?: unknown };
    dimensions?: { organizationId?: unknown; siteId?: unknown; programId?: unknown };
  };
  if (reporting.contractVersion !== REPORTING_SOURCE_CONTRACT_VERSION ||
      reporting.occurredAt !== prior.occurredAt.toISOString() ||
      reporting.source?.kind !== correction.sourceKind ||
      reporting.source?.id !== correction.sourceId ||
      reporting.dimensions?.organizationId !== correction.scope.organizationId ||
      reporting.dimensions?.siteId !== correction.scope.siteId ||
      (reporting.dimensions?.programId ?? null) !== correction.scope.programId ||
      prior.payload.organizationId !== correction.scope.organizationId ||
      prior.payload.siteId !== correction.scope.siteId ||
      (prior.payload.programId ?? null) !== correction.scope.programId) {
    throw new Error("Correction lineage conflicts with the canonical source ownership");
  }
}
