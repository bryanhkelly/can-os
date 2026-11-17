import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("database/canonical/v3.0.1/patch-publisher-rollout-approvals.sql","utf8");

describe("WS5 proposed additive rollout approval migration, not applied",()=>{
  it("creates version-locked publisher and exact-adoption local rollout identifiers",()=>{
    for(const piece of [
      "publisher_rollout_plans (",
      "publisher_rollout_decisions (",
      "operator_rollout_applications (",
      "operator_rollout_decisions (",
      "operator_rollout_class_links (",
      "FOREIGN KEY(plan_id,offering_version_id)",
      "FOREIGN KEY(adoption_id,deployment_id,offering_version_id)",
      "publisher_rollout_plan_version_revision_uq",
      "operator_rollout_revision_uq",
    ])expect(sql).toContain(piece);
  });
  it("forces RLS and supplies no general application/public grants",()=>{
    for(const table of [
      "publisher_rollout_plans","publisher_rollout_decisions",
      "operator_rollout_applications","operator_rollout_decisions",
      "operator_rollout_class_links",
    ]){
      expect(sql).toContain(`ALTER TABLE education_v30.${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE education_v30.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`education_v30.${table} FOR ALL TO neondb_owner`);
    }
    expect(sql).toContain("REVOKE ALL");
    expect(sql).not.toContain("GRANT ALL TO PUBLIC");
    expect(sql).not.toContain("GRANT SELECT TO PUBLIC");
  });
  it("blocks decision rewriting, reviewer self-approval and cross-Site Class links",()=>{
    for(const guard of [
      "publisher_rollout_decision_immutable",
      "publisher_rollout_identity_immutable",
      "operator_rollout_class_link_guard",
      "publisher_rollout_review_independence",
      "p.authored_by_person_id<>NEW.reviewer_person_id",
      "a.prepared_by_person_id<>NEW.reviewer_person_id",
      "c.deployment_id=a.deployment_id",
      "c.adoption_id=a.adoption_id",
      "c.site_id=a.site_id",
      "c.operating_organization_id=a.operating_organization_id",
      "c.course_version_id=NEW.course_version_id",
      "A recorded independent publisher decision is required",
      "A recorded independent operator rollout decision is required",
    ])expect(sql).toContain(guard);
  });
  it("does not alter learner participation, official outcomes or registrations",()=>{
    expect(sql).not.toMatch(/(?:ALTER|DROP|DELETE|TRUNCATE|UPDATE)\s+(?:TABLE\s+)?education_v30\.(?:class_enrollments|learner_course_attempts|class_outcomes|class_awards)/i);
    expect(sql).not.toContain("INSERT INTO education_v30.class_enrollments");
    expect(sql).not.toContain("INSERT INTO education_v30.classes");
  });
});
