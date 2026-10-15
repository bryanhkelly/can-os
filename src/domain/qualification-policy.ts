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

/** Evidence checks are separate from qualification identity and must be scoped by the calling service. */
export type EvidenceFact={type:string;verified:boolean;validFrom?:Date|null;expiresAt?:Date|null;sourceId:string;revoked?:boolean};
export type EvidenceRule={op:"evidence";type:string}|{op:"all"|"any";rules:EvidenceRule[]};
export type PolicyExemption={ruleCode:string;subjectId:string;approvedBy:string;reason:string;validFrom:Date;validThrough:Date;revokedAt?:Date|null};
export function evaluateEvidence(rule:EvidenceRule,facts:EvidenceFact[],asOf:Date):PolicyResult{
 if(rule.op==="evidence"){
  const met=facts.some(f=>f.type===rule.type&&f.verified&&!f.revoked&&(!f.validFrom||f.validFrom<=asOf)&&(!f.expiresAt||f.expiresAt>asOf));
  return {satisfied:met,reasons:met?[]:[`Missing verified evidence: ${rule.type}`]};
 }
 if(!rule.rules.length)return {satisfied:false,reasons:["Empty evidence expression"]};
 const results=rule.rules.map(r=>evaluateEvidence(r,facts,asOf));
 const satisfied=rule.op==="all"?results.every(r=>r.satisfied):results.some(r=>r.satisfied);
 return {satisfied,reasons:satisfied?[]:results.flatMap(r=>r.reasons)};
}
export function evaluateRuleWithExemption(args:{
 ruleCode:string;subjectId:string;qualification:PolicyExpression;credentials:CredentialEvidence[];
 evidenceRule?:EvidenceRule;evidence:EvidenceFact[];exemptions:PolicyExemption[];asOf:Date;
}):PolicyResult & {exempted:boolean}{
 const exemption=args.exemptions.find(x=>x.ruleCode===args.ruleCode&&x.subjectId===args.subjectId&&Boolean(x.approvedBy)&&Boolean(x.reason.trim())&&x.validFrom<=args.asOf&&x.validThrough>args.asOf&&(!x.revokedAt||x.revokedAt>args.asOf));
 if(exemption)return {satisfied:true,exempted:true,reasons:[`Approved exemption: ${exemption.reason}`]};
 const qualification=evaluateQualificationPolicy(args.qualification,args.credentials,args.asOf);
 const evidence=args.evidenceRule?evaluateEvidence(args.evidenceRule,args.evidence,args.asOf):{satisfied:true,reasons:[]};
 return {satisfied:qualification.satisfied&&evidence.satisfied,exempted:false,reasons:[...qualification.reasons,...evidence.reasons]};
}
