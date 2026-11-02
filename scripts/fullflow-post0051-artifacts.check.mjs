import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPost0051MigrationArtifacts as check } from "./fullflow-post0051-artifacts.mjs";
const tables=["graduation_requirement_sets","graduation_decisions","diploma_issuances",
 "academic_credential_deliveries","academic_credential_release_authorizations"].map(table_name=>({table_name}));
const relationshipColumns=["contact_consent_at","source","invitation_batch_id",
 "invitation_recipient_key","family_start_request_id"].map(column_name=>({column_name}));
const cohortColumns=["cohort_start","cohort_end","supersedes_requirement_set_id",
 "applicability_reason"].map(column_name=>({column_name}));
const indexNames=["public_admissions_interests_invited_recipient_uq",
 "public_admissions_interests_family_start_idx","graduation_decision_student_idx",
 "academic_delivery_issuer_idx","academic_delivery_status_idx",
 "academic_release_issuer_idx","academic_release_recipient_idx",
 "graduation_requirement_superseded_once_uq","graduation_requirement_cohort_lookup_idx"];
const futureIndexes=indexNames.map(indexname=>({indexname}));
const cohortConstraints=["graduation_cohort_bounds_ck","graduation_supersession_not_self_ck",
 "graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk"]
 .map(conname=>({conname}));
const full={tables,relationshipColumns,futureIndexes,cohortColumns,cohortConstraints};
test("a clean 0051 ledger permits ONLY absent future objects",()=>{
 assert.deepEqual(check({stage:52}),[]);
});
test("observed FullFlow Neon 0051 ledger with 0053/0055 tables already present is HOLD",()=>{
 const issues=check({stage:52,tables});
 assert(issues.some(v=>v.includes("0053 graduation")&&v.includes("ahead")));
 assert(issues.some(v=>v.includes("0055 credential release")&&v.includes("ahead")));
});
test("partially applied 0052 column with no ledger is HOLD",()=>{
 assert(check({stage:52,relationshipColumns:[{column_name:"contact_consent_at"}]}).length>0);
});
test("valid stages 53–56 preserve strict absent-future checks",()=>{
 for(let stage=53;stage<=56;stage++){
  const allowed={
   tables:tables.slice(0,stage>=54?3:0).concat(stage>=55?tables.slice(3,4):[]).concat(stage>=56?tables.slice(4,5):[]),
   relationshipColumns,
   futureIndexes:futureIndexes.filter(x=>
    !x.indexname.startsWith("graduation_requirement_superseded")&&
    !x.indexname.startsWith("graduation_requirement_cohort")&&
    (stage>=54||!x.indexname.startsWith("graduation_decision"))&&
    (stage>=55||!x.indexname.startsWith("academic_delivery"))&&
    (stage>=56||!x.indexname.startsWith("academic_release"))),
  };
  assert.deepEqual(check({stage,...allowed}),[],`stage ${stage}`);
 }
});
test("complete 0056 stage requires cohorts, indexes and constraints",()=>{
 assert.deepEqual(check({stage:57,...full}),[]);
 assert(check({stage:57,...full,cohortColumns:cohortColumns.slice(1)})
  .some(v=>v.includes("applied cohortColumn missing")));
 assert(check({stage:57,...full,cohortConstraints:cohortConstraints.slice(1)})
  .some(v=>v.includes("applied constraint missing")));
});
