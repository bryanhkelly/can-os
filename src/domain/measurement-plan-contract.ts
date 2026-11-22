import { z } from "zod";
import { requireMetricContract, type SourceMetricContract } from "@/domain/reporting-metric-registry";

/**
 * Portable Measurement Plan contract. Does not change any operational source
 * or create a publishing right. Approved Solution / Initiative services will
 * own persistence, versions and authorization when connected to this contract.
 */
export const MEASUREMENT_PLAN_CONTRACT_VERSION = "1.0.0" as const;
const key = z.string().regex(/^[a-z][a-z0-9_.-]{1,95}$/);
const uuid = z.string().uuid();
const metric = z.object({
  metricKey: key,
  definitionVersion: z.string().trim().min(1).max(128),
  required: z.boolean(),
  purpose: z.enum(["activity", "observed_outcome", "evaluated_impact"]),
  sourceAuthority: key,
  evidenceRequirement: z.string().min(1).max(240),
  /** Targets are explicitly optional; a missing target is not zero. */
  target: z.number().finite().nonnegative().nullable().optional(),
}).strict();
export const measurementPlanSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().trim().min(1).max(128),
  owner: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("solution"), versionId: uuid }).strict(),
    z.object({ kind: z.literal("initiative"), versionId: uuid }).strict(),
  ]),
  metrics: z.array(metric).min(1).max(100),
}).strict().superRefine((plan, ctx) => {
  const keys = plan.metrics.map(m => m.metricKey);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: "custom", path: ["metrics"], message: "Duplicate metric key" });
  }
});
export type MeasurementPlan = z.infer<typeof measurementPlanSchema>;

/**
 * Extend an inherited Solution Measurement Plan without removing mandatory
 * indicators or weakening evidence requirements. Local configuration may add
 * new measures and change a target, never rewrite source authority/purpose.
 * The result needs independent approval before it is used as funded evidence.
 */
export function extendMeasurementPlan(
  inherited: MeasurementPlan,
  options: { version: string; additions?: MeasurementPlan["metrics"];
    targets?: Readonly<Record<string, number | null>> },
): MeasurementPlan {
  const base = measurementPlanSchema.parse(inherited);
  if (!options.version.trim() || options.version === base.version) {
    throw new Error("A modified Measurement Plan requires a distinct immutable version");
  }
  const additions = options.additions ?? [];
  const existing = new Set(base.metrics.map(m => m.metricKey));
  if (additions.some(m => existing.has(m.metricKey))) {
    throw new Error("Existing measurement definitions cannot be overridden locally");
  }
  const targets = options.targets ?? {};
  const allKeys = new Set([...existing, ...additions.map(m => m.metricKey)]);
  if (Object.keys(targets).some(k => !allKeys.has(k))) {
    throw new Error("Target cannot reference an unknown measurement");
  }
  for (const m of base.metrics) {
    const nextTarget = targets[m.metricKey];
    if (m.required && m.target != null &&
        Object.prototype.hasOwnProperty.call(targets,m.metricKey) &&
        (nextTarget === null || nextTarget === undefined || nextTarget < m.target)) {
      throw new Error("Required inherited Measurement Plan targets cannot be weakened");
    }
  }
  const metrics = [...base.metrics, ...additions].map(m => ({
    ...m,
    ...(Object.prototype.hasOwnProperty.call(targets, m.metricKey)
      ? { target: targets[m.metricKey] }
      : {}),
  }));
  return measurementPlanSchema.parse({
    schemaVersion: 1, owner: base.owner, version: options.version, metrics,
  });
}

// Measurement Plans may reference only explicitly versioned, source-owned
// metrics. This validates a draft's semantics but NEVER implies it has been
// approved for funded reporting or external disclosure.
export function validateMeasurementPlanAgainstRegistry(
  plan: MeasurementPlan,
  registry: readonly SourceMetricContract[],
): MeasurementPlan {
  const current = measurementPlanSchema.parse(plan);
  for (const measure of current.metrics) {
    const definition = requireMetricContract(
      registry, measure.metricKey, measure.definitionVersion,
    );
    if (measure.sourceAuthority !== definition.sourceDomain) {
      throw new Error("Measurement source authority conflicts with metric definition");
    }
  }
  return current;
}
