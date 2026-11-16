#!/usr/bin/env node
/** Read-only, explicit QA database acceptance. Never applies migrations or edits rows.
 * Set CAN_NATIVE_CLASS_SCHEMA_VALIDATION=1 and a reviewed isolated DATABASE_URL.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
if(process.env.CAN_NATIVE_CLASS_SCHEMA_VALIDATION!=="1")
  throw new Error("Explicit CAN_NATIVE_CLASS_SCHEMA_VALIDATION=1 required");
if(!process.env.DATABASE_URL)throw new Error("Select an isolated QA DATABASE_URL");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const tables=["classes","class_offerings","class_offering_versions","class_enrollments","class_outcomes","class_awards","class_staff_assignments","class_sessions","course_activity_sets","class_activity_enrollment_pins","class_activity_submissions"];
const secureTables=["course_activity_answer_keys","class_activity_submission_answers"];
const allTriggers=["learner_course_attempt_source_gate","class_enrollment_attempt_guard",
  "canonical_class_offering_guard_trg","canonical_class_staff_guard_trg",
  "canonical_class_enrollment_identity_guard_trg","canonical_class_session_guard_trg",
  "canonical_class_plan_boundary_trg","course_activity_set_immutable_trg",
  "class_activity_pin_source_trg","class_activity_pin_immutable_trg",
  "class_activity_submission_immutable_trg","course_activity_keys_immutable_trg",
  "class_activity_answers_immutable_trg"];
try{
  const [relations,cols,checks,triggers,functions,secureRelations]=await Promise.all([
    pool.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity, EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS grants_public FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])",[tables]),
    pool.query("SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='education_v30' AND table_name=ANY($1::text[])",[[...tables,"learner_course_attempts"]]),
    pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='education_v30.learner_course_attempts'::regclass AND conname='native_course_attempt_one_source_ck'"),
    pool.query("SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('education_v30','education_v30_secure') AND NOT t.tgisinternal AND tgname=ANY($1::text[])",[allTriggers]),
    pool.query("SELECT pg_get_functiondef('education_v30.validate_course_attempt_source()'::regprocedure) AS body"),
    pool.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity, EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS grants_public FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='education_v30_secure' AND c.relname=ANY($1::text[])",[secureTables]),
  ]);
  assert.equal(relations.rows.length,tables.length,"Missing unified Class relation");
  for(const row of relations.rows) {
    assert(row.relrowsecurity&&row.relforcerowsecurity,"RLS not forced on "+row.relname);
    assert(!row.grants_public,"PUBLIC access forbidden on "+row.relname);
  }
  const have=new Set(cols.rows.map(row=>row.table_name+"."+row.column_name));
  for(const name of [
    "classes.course_version_id","classes.adoption_id","classes.capacity",
    "class_offerings.class_id",
    "class_offering_versions.enrollment_methods",
    "class_offering_versions.allowed_credit_modes",
    "class_offering_versions.consent_text",
    "class_enrollments.learner_person_id",
    "class_enrollments.enrolled_by_person_id",
    "class_enrollments.course_attempt_id",
    "class_enrollments.credit_mode",
    "class_outcomes.class_enrollment_id",
    "class_awards.policy_evidence_version_id",
    "class_staff_assignments.class_id",
    "class_staff_assignments.person_id",
    "class_staff_assignments.role_code",
    "class_staff_assignments.attendance_authorized",
    "class_staff_assignments.state",
    "class_sessions.class_id",
    "class_sessions.classroom_plan_id",
    "class_sessions.delivery_session_id",
    "class_sessions.facilitator_person_id",
    "learner_course_attempts.class_enrollment_id",
    "course_activity_sets.course_version_id",
    "course_activity_sets.quiz_questions",
    "course_activity_sets.feedback_consent_text",
    "course_activity_sets.passing_fraction",
    "class_activity_enrollment_pins.class_enrollment_id",
    "class_activity_enrollment_pins.activity_set_id",
    "class_activity_submissions.class_enrollment_id",
    "class_activity_submissions.kind",
    "class_activity_submissions.feedback_consent_sha256",
  ]) assert(have.has(name),"Missing native Class column "+name);
  const enrollmentOffering=cols.rows.find(row=>row.table_name==="class_enrollments"&&row.column_name==="class_offering_version_id");
  assert.equal(enrollmentOffering?.is_nullable,"YES",
    "Class assignment must work without a Class Offering");
  assert.equal(checks.rows.length,1,"Native Course Attempt single-source guard missing");
  assert(checks.rows[0].definition.includes("class_enrollment_id"),
    "Course Attempt must accept Class Enrollment identity");
  for(const name of allTriggers)
    assert(triggers.rows.some(x=>x.tgname===name),"Missing guard "+name);
  assert.equal(secureRelations.rows.length,secureTables.length,
    "Private answer-key and survey-response storage is missing");
  for(const row of secureRelations.rows){
    assert(row.relrowsecurity&&row.relforcerowsecurity,"Secure RLS not forced on "+row.relname);
    assert(!row.grants_public,"PUBLIC cannot read private Class activity answers: "+row.relname);
  }
  assert(!have.has("course_activity_sets.answer_keys"),
    "Public Course activity rows must never contain quiz correct keys");
  assert(functions.rows[0]?.body?.includes("NEW.class_enrollment_id"),
    "Course Attempt source guard does not verify native Class Enrollment");
  console.log("Native Classes, reusable Course activities, private answers, direct Course Attempt source, RLS and triggers verified (read only).");
}finally{await pool.end();}
