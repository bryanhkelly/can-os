import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const staged=()=>readFileSync(
 "database/production/2026-11-17-stage-final-11-learner-person-fks.sql","utf8");

describe("P0 final learner Person FK migration is release gated",()=>{
 it("cannot execute until independent identity and guardian runtime acceptance",()=>{
  const sql=staged();
  expect(sql).toContain("can.one_person_runtime_cutover_verified");
  expect(sql).toContain("can.remaining_learner_person_fk_rebind_approved");
  expect(sql).toContain("Approved one-Person learner/guardian runtime cutover is required");
  expect(sql).toContain("br-restless-sea-ar9ooo55");
  expect(sql).toContain("sweet-hall-62441909");
  expect(sql).toContain("EXISTS(SELECT 1 FROM education_v30.canonical_accounts)");
  expect(sql).toContain("WHERE revoked_at IS NULL AND expires_at>clock_timestamp()");
  expect(sql).toContain("Learner history found on");
  expect(sql).not.toContain("DROP TABLE education_v30.persons");
  expect(sql).not.toContain("CREATE TABLE public.persons");
 });
 it("preserves distinct RESTRICT and NO ACTION semantics and explicit FK metadata",()=>{
  const sql=staged();
  const names=[
    "canonical_account_grants_person_id_fkey",
    "class_enrollments_enrolled_by_person_id_fkey",
    "class_enrollments_learner_person_id_fkey",
    "facilitated_pairs_person_fk",
    "learner_achievement_decisions_recipient_person_id_fkey",
    "learner_profiles_person_id_fkey",
    "learning_completion_evidence_binding_participant_person_id_fkey",
    "learning_completion_evidence_review__participant_person_id_fkey",
    "canonical_learning_sessions_person_fk",
    "noncredit_registrations_participant_person_id_fkey",
    "noncredit_self_enrollment_claims_participant_person_id_fkey",
  ];
  expect(new Set(names).size).toBe(11);
  for(const name of names)expect(sql).toContain("'"+name+"'");
  expect(sql).toContain("('noncredit_self_enrollment_claims','participant_person_id','noncredit_self_enrollment_claims_participant_person_id_fkey','r')");
  expect(sql).toContain("ON DELETE RESTRICT");
  expect(sql).toContain("REFERENCES public.people(id)");
  expect(sql).toContain("c.convalidated");
  expect(sql).toContain("c.condeferrable");
  expect(sql).toContain("c.confdeltype");
  expect(sql).toContain("c.confupdtype");
  expect(sql).toContain("Learner Person FK cutover failed verification");
  const executable=sql.split("\n").filter(l=>!l.trimStart().startsWith("--")).join("\n");
  expect(executable).not.toMatch(/\bCASCADE\b|\bDROP TABLE\b|\bDELETE FROM\b|\bINSERT INTO public.people\b/);
 });
});
