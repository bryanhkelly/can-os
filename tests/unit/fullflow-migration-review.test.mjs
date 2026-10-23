import { describe, expect, it } from "vitest";
import { assessFullFlowMigrationReadiness } from "../../scripts/review-fullflow-migrations.mjs";

const pending = [
  "0032_extended_program_offerings", "0033_extended_season_drafts",
  "0034_enrichment_packages", "0035_site_publications",
  "0036_program_publications", "0037_public_admissions_interests",
  "0038_public_interest_conversion",
];

function reviewedState() {
  const entries = Array.from({ length: 32 }, (_, idx) =>
    ({ idx, tag: "historical-" + idx, when: idx === 31 ? 1792700000000 : idx }));
  entries.push(...pending.map((tag, n) => ({
    idx: 32+n, tag, when: 1792704000000+n*3600000,
  })));
  return {
    project: "sweet-hall-62441909", branch: "br-proud-pine-arfju8h2",
    applied: 32, lastTimestamp: "1792700000000",
    journal: { entries },
    types: [
      { typname: "program_type", enumlabel: "church_hosted_academy" },
      { typname: "activity_season_status", enumlabel: "registration" },
    ],
    columns: [
      { table_name: "programs", column_name: "credit_issuing_organization_id", is_nullable: "NO" },
    ],
    tables: [],
  };
}
describe("FullFlow migration review (read-only)", () => {
  it("recognizes the exact approved 0031 -> 0038 starting schema", () => {
    const result=assessFullFlowMigrationReadiness(reviewedState());
    expect(result.ready).toBe(true);
    expect(result.status).toBe("PRECONDITIONS_MATCH_NOT_APPLIED");
    expect(result.appliedMigrations).toBe(32);
    expect(result.pendingMigrations).toEqual(pending);
  });
  it("refuses the production and shared test branches", () => {
    for (const branch of ["br-restless-sea-ar9ooo55", "br-bitter-feather-ar0u63x7"]) {
      const result=assessFullFlowMigrationReadiness({...reviewedState(),branch});
      expect(result.ready).toBe(false);
    }
  });
  it("refuses partial migration or untracked schema drift", () => {
    const original=reviewedState();
    for (const change of [
      {applied:33},
      {lastTimestamp:1792704000000},
      {types:[...original.types,{typname:"program_type",enumlabel:"summer_program"}]},
      {columns:[...original.columns,{table_name:"activity_seasons",column_name:"metadata",is_nullable:"NO"}]},
      {tables:[{table_name:"site_publications"}]},
      {columns:[{table_name:"programs",column_name:"credit_issuing_organization_id",is_nullable:"YES"}]},
      {journal:{entries:original.journal.entries.slice(0,-1)}},
    ]) {
      expect(assessFullFlowMigrationReadiness({...original,...change}).ready)
        .toBe(false);
    }
  });
});
