/** Versioned, data-driven qualification policies; no role- or state-specific branches.
 * Persist definitions with author, effective period and authority provenance.
 */
export type CredentialEvidence = {
  type: string; issuer?: string; jurisdiction?: string; verified: boolean;
  validFrom?: Date | null; expiresAt?: Date | null; revoked?: boolean;
};
export type PolicyExpression =
  | { op: "credential"; type: string; issuer?: string; jurisdiction?: string }
  | { op: "all"; rules: PolicyExpression[] }
  | { op: "any"; rules: PolicyExpression[] }
  | { op: "atLeast"; count: number; rules: PolicyExpression[] };
export type PolicyResult = { satisfied: boolean; reasons: string[] };
export function evaluateQualificationPolicy(
  expr: PolicyExpression, evidence: CredentialEvidence[], asOf: Date,
): PolicyResult {
  if (expr.op === "credential") {
    const matching=evidence.filter(c=>c.type===expr.type && (!expr.issuer||expr.issuer===c.issuer) && (!expr.jurisdiction||expr.jurisdiction===c.jurisdiction));
    const satisfied=matching.some(c=>c.verified&&!c.revoked&&(!c.validFrom||c.validFrom<=asOf)&&(!c.expiresAt||c.expiresAt>asOf));
    return {satisfied,reasons:satisfied?[]:[`No current verified credential matching ${expr.type}`]};
  }
  if (!expr.rules.length) return {satisfied:false,reasons:["Empty qualification policy"]};
  const results=expr.rules.map(rule=>evaluateQualificationPolicy(rule,evidence,asOf));
  const count=results.filter(r=>r.satisfied).length;
  const needed=expr.op==="all"?results.length:expr.op==="any"?1:expr.count;
  if (!Number.isInteger(needed)||needed<1||needed>results.length) return {satisfied:false,reasons:["Invalid policy threshold"]};
  return {satisfied:count>=needed,reasons:count>=needed?[]:results.flatMap(r=>r.reasons)};
}
