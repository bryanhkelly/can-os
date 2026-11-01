/** Read-only 0052–0056 schema/ledger consistency guard.
 * A pre-existing table does NOT establish a completed Drizzle migration. */
const rules=[
 {tag:"0052 family recruitment",stage:53,
  columns:["contact_consent_at","source","invitation_batch_id",
    "invitation_recipient_key","family_start_request_id"],
  indexes:["public_admissions_interests_invited_recipient_uq",
    "public_admissions_interests_family_start_idx"]},
 {tag:"0053 graduation",stage:54,
  tables:["graduation_requirement_sets","graduation_decisions","diploma_issuances"],
  indexes:["graduation_decision_student_idx"]},
 {tag:"0054 credential delivery",stage:55,
  tables:["academic_credential_deliveries"],
  indexes:["academic_delivery_issuer_idx","academic_delivery_status_idx"]},
 {tag:"0055 credential release",stage:56,
  tables:["academic_credential_release_authorizations"],
  indexes:["academic_release_issuer_idx","academic_release_recipient_idx"]},
 {tag:"0056 cohort",stage:57,
  cohortColumns:["cohort_start","cohort_end","supersedes_requirement_set_id","applicability_reason"],
  indexes:["graduation_requirement_superseded_once_uq","graduation_requirement_cohort_lookup_idx"],
  constraints:["graduation_cohort_bounds_ck","graduation_supersession_not_self_ck",
    "graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk"]},
];
export function assessPost0051MigrationArtifacts({
 stage,tables=[],relationshipColumns=[],futureIndexes=[],cohortColumns=[],cohortConstraints=[],
}){
 const present={
  table:new Set(tables.map(x=>x.table_name)),
  column:new Set(relationshipColumns.map(x=>x.column_name)),
  index:new Set(futureIndexes.map(x=>x.indexname)),
  cohortColumn:new Set(cohortColumns.map(x=>x.column_name)),
  constraint:new Set(cohortConstraints.map(x=>x.conname)),
 };
 const issues=[];
 for(const rule of rules){
  const applied=stage>=rule.stage;
  for(const [kind,fields] of [
   ["table",rule.tables??[]],["column",rule.columns??[]],
   ["index",rule.indexes??[]],["cohortColumn",rule.cohortColumns??[]],
   ["constraint",rule.constraints??[]],
  ]){
   for(const name of fields){
    const exists=present[kind].has(name);
    if(applied&&!exists)issues.push(`${rule.tag}: applied ${kind} missing: ${name}`);
    if(!applied&&exists)issues.push(`${rule.tag}: ${kind} exists ahead of migration ledger: ${name}; HOLD manual reconciliation`);
   }
  }
 }
 return issues;
}
