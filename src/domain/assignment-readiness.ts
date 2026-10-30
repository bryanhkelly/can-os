import { evaluateRuleWithExemption, type CredentialEvidence, type EvidenceFact, type PolicyExpression, type EvidenceRule, type PolicyExemption } from "./qualification-policy";
export type ResponsibilityAssignment={ responsibilityKey:string; accountableOrganizationId:string; responsibleRoleAssignmentId?:string|null; activeFrom?:Date|null; activeThrough?:Date|null };
export function validateResponsibilityAssignments(requiredKeys:string[], assignments:ResponsibilityAssignment[],asOf:Date):string[]{
 const errors:string[]=[];
 for(const key of requiredKeys){
  const active=assignments.filter(a=>a.responsibilityKey===key&&(!a.activeFrom||a.activeFrom<=asOf)&&(!a.activeThrough||a.activeThrough>asOf));
  if(active.length!==1 || !active[0]?.accountableOrganizationId)errors.push(`Responsibility ${key} requires exactly one active accountable organization`);
 }
 return errors;
}
export function assessAssignmentReadiness(args:{
 roleAssignmentId:string;personId:string;policyRuleCode:string;policy:PolicyExpression;credentials:CredentialEvidence[];
 evidenceRule?:EvidenceRule;evidence:EvidenceFact[];exemptions:PolicyExemption[];asOf:Date;
 assignmentIsActive:boolean;hasAuthorizedMembership:boolean;
}){
 if(!args.roleAssignmentId||!args.personId||!args.assignmentIsActive||!args.hasAuthorizedMembership)
  return {eligible:false,exempted:false,reasons:["No active, authorized staffing assignment"]};
 const decision=evaluateRuleWithExemption({ruleCode:args.policyRuleCode,subjectId:args.roleAssignmentId,qualification:args.policy,credentials:args.credentials,evidenceRule:args.evidenceRule,evidence:args.evidence,exemptions:args.exemptions,asOf:args.asOf});
 return {eligible:decision.satisfied,exempted:decision.exempted,reasons:decision.reasons};
}
