import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const schema=readFileSync("database/canonical/v3.0.1/schema.sql","utf8");
const pin=readFileSync("database/canonical/v3.0.1/patch-noncredit-locked-policy.sql","utf8");
const auto=readFileSync("database/canonical/v3.0.1/patch-noncredit-automatic-completion.sql","utf8");
const baseline=readFileSync("database/canonical/v3.0.1/patch-noncredit-baseline-diagnostic.sql","utf8");
const reader=readFileSync("src/modules/learning/noncredit-completion.functions.ts","utf8");
const policyApi=readFileSync("src/modules/learning/noncredit-completion-policy.functions.ts","utf8");
const outcomes=readFileSync("src/modules/learning/noncredit-pilot-outcomes.functions.ts","utf8");

describe("canonical noncredit automatic completion and frozen policy boundaries",()=>{
 it("pins published effective policy at registration, not latest policy at completion",()=>{
  expect(pin).toContain("p.published_at<=NEW.registered_at");
  expect(pin).toContain("p.effective_at<=NEW.registered_at");
  expect(pin).toContain("completion_policy_id");
  expect(pin).toContain("immutable after registration");
  expect(reader).toContain("registration.completionPolicyId");
  expect(reader).not.toContain("lte(noncreditCompletionPolicies.effectiveAt,now)");
 });
 it("defaults to provider-review and requires an approved automatic policy",()=>{
  expect(schema).toContain("completion_mode text NOT NULL DEFAULT 'provider_review'");
  expect(auto).toContain("completion_mode='automatic'");
  expect(auto).toContain("decision_source");
  expect(auto).toContain("decided_by_person_id");
  expect(schema).toContain("NEW.decision_source='automatic'");
  expect(schema).toContain("pol.approved_by_person_id");
  expect(policyApi).toContain('completionMode:z.enum(["provider_review","automatic"])');
  expect(policyApi).toContain("future_registrations");
 });
 it("requires independently verified evidence and current result for automated completion",()=>{
  for(const source of [auto,schema]){
   expect(source).toContain("v.verified_by_person_id IS NOT NULL");
   expect(source).toContain("v.valid_through");
   expect(source).toContain("newer.supersedes_id=e.id");
   expect(source).toContain("ca.noncredit_registration_id");
   expect(source).toContain("result.result_status='finalized'");
  }
  expect(auto).toContain("IF pol.require_all_lessons AND NOT EXISTS");
  expect(auto).toContain("a.state='finalized'");
 });
 it("does not silently override a human completion correction or double-issue",()=>{
  expect(auto).toContain("IF EXISTS (SELECT 1 FROM noncredit_completion_decisions d");
  expect(auto).toContain("FOR UPDATE OF r");
  expect(auto).toContain("actor_person_id");
 });
 it("keeps baseline diagnostic separate from final completion",()=>{
  expect(baseline).toContain("baseline_assessment_version_id");
  expect(baseline).toContain("definition.purpose='diagnostic'");
  expect(baseline).toContain("noncreditPhase");
  expect(auto).toContain("admin.assessment_version_id=reg.training_assessment_id");
  expect(outcomes).toContain("startedBeforeInstruction");
  expect(outcomes).toContain("baselineFraction:paired");
 });
});
