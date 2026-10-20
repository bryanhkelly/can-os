import { z } from "zod";
import { evaluateQualificationPolicy, type CredentialEvidence, type PolicyExpression } from "@/domain/qualification-policy";
import { dateTimeInputInTimezone } from "@/modules/calendar/timezone";

const expression: z.ZodType<PolicyExpression> = z.lazy(() => z.union([
  z.object({ op: z.literal("credential"), type: z.string().min(1),
    issuer: z.string().min(1).optional(), jurisdiction: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal("all"), rules: z.array(expression).min(1).max(100) }).strict(),
  z.object({ op: z.literal("any"), rules: z.array(expression).min(1).max(100) }).strict(),
  z.object({ op: z.literal("atLeast"), count: z.number().int().positive(),
    rules: z.array(expression).min(1).max(100) }).strict().refine(value => value.count <= value.rules.length),
]));

export type CoverageWindow = { from: Date; through: Date };
export type CoveragePolicy = CoverageWindow & {
  id: string; code: string; expression: Record<string, unknown>; evidencePolicy: Record<string, unknown>;
};

export function instructionalWindow(input: {
  startsAt: Date | null; endsAt: Date | null; startsOn: string; endsOn: string; timezone: string;
}): CoverageWindow {
  const nextDay = new Date(`${input.endsOn}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const from = input.startsAt ?? new Date(dateTimeInputInTimezone(`${input.startsOn}T00:00`, input.timezone));
  const through = input.endsAt ?? new Date(dateTimeInputInTimezone(`${nextDay.toISOString().slice(0, 10)}T00:00`, input.timezone));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(through.getTime()) || from >= through) {
    throw new Error("Section instructional dates must define a nonempty, increasing coverage window");
  }
  return { from, through };
}

export function evaluateQualificationCoverage(
  window: CoverageWindow, policies: CoveragePolicy[], evidence: CredentialEvidence[],
): { eligible: boolean; reasons: string[]; policyRuleIds: string[] } {
  if (!Number.isFinite(window.from.getTime()) || !Number.isFinite(window.through.getTime()) || window.from >= window.through) {
    throw new Error("Invalid qualification coverage window");
  }
  const reasons = new Set<string>();
  const ruleIds = new Set<string>();
  const boundaries = new Set([window.from.getTime()]);
  for (const date of [
    ...policies.flatMap(policy => [policy.from, policy.through]),
    ...evidence.flatMap(credential => [credential.validFrom, credential.expiresAt]),
  ]) {
    if (date && date > window.from && date < window.through) boundaries.add(date.getTime());
  }
  for (const time of [...boundaries].sort((a, b) => a - b)) {
    const at = new Date(time);
    const applicable = policies.filter(policy => policy.from <= at && policy.through > at);
    if (!applicable.length) reasons.add(`Qualification policy not configured for ${at.toISOString()}.`);
    for (const policy of applicable) {
      ruleIds.add(policy.id);
      const parsed = expression.safeParse(policy.expression);
      if (!parsed.success) {
        reasons.add(`Qualification policy ${policy.code} has an invalid or unsupported expression.`);
        continue;
      }
      if (Object.keys(policy.evidencePolicy).length) {
        reasons.add(`Qualification policy ${policy.code} requires an unsupported evidence policy; compliance review is required.`);
        continue;
      }
      const result = evaluateQualificationPolicy(parsed.data, evidence, at);
      for (const reason of result.reasons) reasons.add(`${policy.code}: ${reason} at ${at.toISOString()}.`);
    }
  }
  return { eligible: reasons.size === 0, reasons: [...reasons], policyRuleIds: [...ruleIds] };
}
