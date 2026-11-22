import { CLASS_REPORT_CONTRACT_VERSION, CLASS_METRIC_DEFINITIONS } from "@/domain/participation-reporting";
import { NONCREDIT_PILOT_COUNT_DEFINITIONS } from "@/domain/noncredit-pilot-outcomes";

/**
 * One read-only registry for existing evidence metrics. It ADAPTS their
 * authoritative domain definitions rather than copying formulas or creating
 * a competing metric ledger.
 *
 * A future governed registry may persist approved versions; this view is
 * intentionally source-owned and private. Metric calculation stays in its
 * domain projection until a tested shared execution contract replaces it.
 */
export const REPORTING_METRIC_REGISTRY_CONTRACT_VERSION = "1.0.0" as const;
export const NONCREDIT_PILOT_DEFINITION_VERSION = "1.0.0" as const;

export type SourceMetricContract = {
  metricKey: string;
  definitionVersion: string;
  sourceDomain: "native_class" | "noncredit_pilot";
  sourceMetricKey: string;
  label: string;
  source: string;
  denominator: string;
  rule: string;
  timeBasis: string;
  disclosure: "private_operational";
};

function makeMetricContract(
  namespace: "class" | "noncredit",
  domain: SourceMetricContract["sourceDomain"],
  version: string,
  def: { key: string; label: string; source: string;
    denominator: string; rule: string; timeBasis: string },
): SourceMetricContract {
  for (const [field, value] of Object.entries(def)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Metric source contract missing " + field);
    }
  }
  return {
    metricKey: namespace + "." + def.key,
    definitionVersion: version,
    sourceDomain: domain,
    sourceMetricKey: def.key,
    label: def.label, source: def.source, denominator: def.denominator,
    rule: def.rule, timeBasis: def.timeBasis,
    disclosure: "private_operational",
  };
}

export function buildCurrentReportingMetricRegistry(): readonly SourceMetricContract[] {
  const combined = [
    ...CLASS_METRIC_DEFINITIONS.map(def =>
      makeMetricContract("class", "native_class", CLASS_REPORT_CONTRACT_VERSION, def)),
    ...NONCREDIT_PILOT_COUNT_DEFINITIONS.map(def =>
      makeMetricContract("noncredit", "noncredit_pilot",
        NONCREDIT_PILOT_DEFINITION_VERSION, def)),
  ];
  if (new Set(combined.map(m => m.metricKey)).size !== combined.length) {
    throw new Error("Repeated cross-module metric identifier");
  }
  return combined;
}

export function requireMetricContract(
  registry: readonly SourceMetricContract[],
  metricKey: string,
  definitionVersion: string,
): SourceMetricContract {
  const metric = registry.find(row => row.metricKey === metricKey &&
    row.definitionVersion === definitionVersion);
  if (!metric) throw new Error("Unknown metric definition or version");
  return metric;
}
