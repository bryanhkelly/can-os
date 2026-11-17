import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("retiring academic records requires independent cutover evidence", () => {
  const retirement = source("scripts/acceptance/check-legacy-retirement-readiness.mjs");
  const candidates = source("scripts/acceptance/report-class-cutover-candidates.mjs");

  it("pins both read-only scripts to isolated test01", () => {
    for (const script of [retirement, candidates]) {
      expect(script).toContain("BEGIN READ ONLY");
      expect(script).toContain("ROLLBACK");
      expect(script).toContain("br-bitter-feather-ar0u63x7");
      expect(script).toContain("sweet-hall-62441909");
      expect(script).not.toMatch(/\b(?:INSERT INTO|UPDATE\s+(?:public|education_v30)|DELETE FROM|DROP TABLE|TRUNCATE TABLE)\b/i);
    }
  });

  it("cannot certify identity cutover just because there are zero identity links", () => {
    expect(retirement).toContain("shared_person_ids");
    expect(retirement).toContain("shared_account_ids");
    expect(retirement).toContain("active_native_sessions");
    expect(retirement).toContain("identityDiverged");
    expect(retirement).toContain("assert.equal(identityDiverged, false");
  });

  it("requires published version and original publisher, not title matching", () => {
    expect(retirement).toContain("cv.version_no=v.version");
    expect(retirement).toContain("c.publisher_organization_id=t.owning_organization_id");
    expect(retirement).toContain("ambiguous_published_course_matches");
    expect(retirement).toContain("missing_published_course_matches");
    expect(candidates).toContain("cv.version_no=ctv.version");
    expect(candidates).toContain("content_equivalence_review_required");
    expect(candidates).toContain("can_auto_migrate:false");
  });

  it("blocks orphaned and duplicate source enrollment records", () => {
    expect(retirement).toContain("orphaned_section_enrollment_profiles");
    expect(retirement).toContain("orphaned_section_enrollment_classes");
    expect(retirement).toContain("duplicate_active_section_placements");
    expect(retirement).toContain("assert.equal(sourceIntegrityViolations.length, 0");
  });

  it("discovers all dependent foreign keys instead of assuming a fixed list", () => {
    expect(retirement).toContain("pg_constraint fk");
    expect(retirement).toContain("fk.confrelid='public.sections'::regclass");
    expect(retirement).toContain("blockingDependents");
  });
});
