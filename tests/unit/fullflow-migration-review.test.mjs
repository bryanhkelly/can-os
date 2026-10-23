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

describe("FullFlow 0039 Program-Site authorization migration gate", () => {
  function migratedBase() {
    const state = reviewedState();
    state.journal.entries.push({
      idx: 39, tag: "0039_program_site_authorizations", when: 1792731600000,
    });
    return {
      ...state, applied: 39, lastTimestamp: "1792728000000",
      types: [...state.types,
        {typname: "program_type", enumlabel: "summer_program"},
        {typname: "program_type", enumlabel: "after_school_enrichment"},
        {typname: "activity_season_status", enumlabel: "draft"},
      ],
      columns: [
        {table_name:"programs",column_name:"credit_issuing_organization_id",is_nullable:"YES"},
        {table_name:"activity_seasons",column_name:"metadata",is_nullable:"NO"},
        {table_name:"activity_registrations",column_name:"metadata",is_nullable:"NO"},
      ],
      tables: ["site_publications","program_publications","public_admissions_interests"]
        .map(table_name => ({table_name})),
    };
  }
  it("allows exactly the additive 0039 migration on the dedicated already-migrated branch", () => {
    const result = assessFullFlowMigrationReadiness(migratedBase());
    expect(result).toMatchObject({
      ready: true, status: "PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations: ["0039_program_site_authorizations"],
    });
  });
  it("accepts the checked 0040-migration state without reapplying 0039", () => {
    const state = migratedBase();
    const result = assessFullFlowMigrationReadiness({
      ...state, applied: 40, lastTimestamp: "1792731600000",
      tables: [...state.tables, {table_name:"program_site_authorizations"}],
    });
    expect(result).toMatchObject({ready: true,status:"UP_TO_DATE",pendingMigrations:[]});
  });
  it("refuses any partial schema, wrong branch, or mismatched 0039 ledger state", () => {
    const state = migratedBase();
    for (const change of [
      { branch:"br-restless-sea-ar9ooo55" }, { branch:"br-bitter-feather-ar0u63x7" },
      { applied:38 }, { applied:40 }, {lastTimestamp:"1792731600000"},
      { tables:[...state.tables, {table_name:"program_site_authorizations"}] },
      { columns:state.columns.filter(x => x.column_name!=="metadata") },
      { types:state.types.filter(x=>x.enumlabel!=="draft") },
    ]) {
      expect(assessFullFlowMigrationReadiness({...state,...change}).ready).toBe(false);
    }
  });
});
