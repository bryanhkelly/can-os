import { describe, expect, it } from "vitest";
import { assessFullFlowMigrationReadiness } from "../../scripts/review-fullflow-migrations.mjs";

const pending = [
  "0032_extended_program_offerings", "0033_extended_season_drafts",
  "0034_enrichment_packages", "0035_site_publications",
  "0036_program_publications", "0037_public_admissions_interests",
  "0038_public_interest_conversion",
];
// Committed journal timestamps for 0032-0038 (drizzle/meta/_journal.json).
// Drizzle's migrator stores these as __drizzle_migrations.created_at, so the
// ledger max(created_at) after applying 0038 must equal 1792728000000.
const pendingWhen = [
  1792704000000, 1792710000000, 1792713600000, 1792717200000,
  1792720800000, 1792724400000, 1792728000000,
];

function reviewedState() {
  const entries = Array.from({ length: 32 }, (_, idx) =>
    ({ idx, tag: "historical-" + idx, when: idx === 31 ? 1792700000000 : idx }));
  entries.push(...pending.map((tag, n) => ({
    idx: 32+n, tag, when: pendingWhen[n],
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
      authorizationColumns: [
        "id","program_id","site_id","host_organization_id","institution_organization_id",
        "version","status","services","requested_by_person_id","requested_at",
        "evidence_document_id","effective_from","effective_through","reviewed_by_person_id",
        "reviewed_at","review_reason","revoked_by_person_id","revoked_at",
        "revocation_reason","created_at","updated_at",
      ].map(column_name=>({column_name})),
      authorizationIndexes: ["program_site_authorization_version_uq",
        "program_site_authorization_current_uq"].map(indexname=>({indexname})),
      authorizationConstraints: [
        "program_site_authorization_status_ck","program_site_authorization_review_ck",
        "program_site_authorization_revoked_ck","program_site_authorization_distinct_review_ck",
        "program_site_authorization_services_ck",
      ].map(conname=>({conname})),
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

  it("rejects missing 0039 authorization invariants despite a matching ledger", () => {
    const state=migratedBase();
    const completeState={
      ...state, applied:40, lastTimestamp:"1792731600000",
      tables:[...state.tables,{table_name:"program_site_authorizations"}],
      authorizationColumns:[
        "id","program_id","site_id","host_organization_id","institution_organization_id",
        "version","status","services","requested_by_person_id","requested_at",
        "evidence_document_id","effective_from","effective_through","reviewed_by_person_id",
        "reviewed_at","review_reason","revoked_by_person_id","revoked_at",
        "revocation_reason","created_at","updated_at",
      ].map(column_name=>({column_name})),
      authorizationIndexes:["program_site_authorization_version_uq",
        "program_site_authorization_current_uq"].map(indexname=>({indexname})),
      authorizationConstraints:[
        "program_site_authorization_status_ck","program_site_authorization_review_ck",
        "program_site_authorization_revoked_ck","program_site_authorization_distinct_review_ck",
        "program_site_authorization_services_ck",
      ].map(conname=>({conname})),
    };
    expect(assessFullFlowMigrationReadiness(completeState).ready).toBe(true);
    for (const altered of [
      {authorizationColumns:completeState.authorizationColumns.filter(x=>x.column_name!=="revocation_reason")},
      {authorizationIndexes:completeState.authorizationIndexes.filter(x=>x.indexname!=="program_site_authorization_current_uq")},
      {authorizationConstraints:completeState.authorizationConstraints.filter(x=>x.conname!=="program_site_authorization_review_ck")},
    ]) expect(assessFullFlowMigrationReadiness({...completeState,...altered}).ready).toBe(false);
  });
});


describe("FullFlow 0040 staged migration readiness (read-only)", () => {
  function stateAt0038() {
    const old=reviewedState();
    old.journal.entries.push(
      {idx:39,tag:"0039_program_site_authorizations",when:1792731600000},
      {idx:40,tag:"0040_site_local_content",when:1792735200000},
    );
    return {
      ...old,applied:39,lastTimestamp:"1792728000000",
      types:[...old.types,
        {typname:"program_type",enumlabel:"summer_program"},
        {typname:"program_type",enumlabel:"after_school_enrichment"},
        {typname:"activity_season_status",enumlabel:"draft"},
      ],
      columns:[
        {table_name:"programs",column_name:"credit_issuing_organization_id",is_nullable:"YES"},
        {table_name:"activity_seasons",column_name:"metadata",is_nullable:"NO"},
        {table_name:"activity_registrations",column_name:"metadata",is_nullable:"NO"},
      ],
      tables:["site_publications","program_publications","public_admissions_interests"]
        .map(table_name=>({table_name})),
    };
  }
  function stateAfter0039() {
    const state=stateAt0038();
    return {
      ...state,applied:40,lastTimestamp:"1792731600000",
      tables:[...state.tables,{table_name:"program_site_authorizations"}],
      authorizationColumns:[
        "id","program_id","site_id","host_organization_id","institution_organization_id",
        "version","status","services","requested_by_person_id","requested_at",
        "evidence_document_id","effective_from","effective_through","reviewed_by_person_id",
        "reviewed_at","review_reason","revoked_by_person_id","revoked_at",
        "revocation_reason","created_at","updated_at",
      ].map(column_name=>({column_name})),
      authorizationIndexes:["program_site_authorization_version_uq",
        "program_site_authorization_current_uq"].map(indexname=>({indexname})),
      authorizationConstraints:[
        "program_site_authorization_status_ck","program_site_authorization_review_ck",
        "program_site_authorization_revoked_ck","program_site_authorization_distinct_review_ck",
        "program_site_authorization_services_ck",
      ].map(conname=>({conname})),
    };
  }
  function stateAfter0040() {
    const state=stateAfter0039();
    return {
      ...state,applied:41,lastTimestamp:"1792735200000",
      tables:[...state.tables,{table_name:"site_local_content_versions"}],
      localCopyColumns:[
        "id","site_id","revision","status","content","flagged_fields",
        "created_by_person_id","restored_from_revision","created_at",
      ].map(column_name=>({column_name})),
      localCopyIndexes:["site_local_content_site_revision_uq",
        "site_local_content_site_status_idx"].map(indexname=>({indexname})),
      localCopyConstraints:[
        "site_local_content_positive_revision_ck","site_local_content_status_ck",
        "site_local_content_document_ck","site_local_content_flagged_ck",
      ].map(conname=>({conname})),
    };
  }
  it("permits only staged 0039 then 0040 application",()=>{
    expect(assessFullFlowMigrationReadiness(stateAt0038())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0039_program_site_authorizations","0040_site_local_content"],
    });
    expect(assessFullFlowMigrationReadiness(stateAfter0039())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0040_site_local_content"],
    });
    expect(assessFullFlowMigrationReadiness(stateAfter0040())).toMatchObject({
      ready:true,status:"UP_TO_DATE",pendingMigrations:[],
    });
  });
  it("rejects partial 0040, premature tables and wrong branch",()=>{
    const after=stateAfter0040();
    for (const changed of [
      {localCopyColumns:after.localCopyColumns.filter(x=>x.column_name!=="flagged_fields")},
      {localCopyIndexes:after.localCopyIndexes.filter(x=>x.indexname!=="site_local_content_site_revision_uq")},
      {localCopyConstraints:after.localCopyConstraints.filter(x=>x.conname!=="site_local_content_status_ck")},
      {lastTimestamp:"1792731600000"},{applied:40},
      {branch:"br-restless-sea-ar9ooo55"},
    ]) {
      expect(assessFullFlowMigrationReadiness({...after,...changed}).ready).toBe(false);
    }
    const premature=stateAt0038();
    expect(assessFullFlowMigrationReadiness({
      ...premature,tables:[...premature.tables,{table_name:"site_local_content_versions"}],
    }).ready).toBe(false);
  });
});

describe("FullFlow 0041-0046 staged migration readiness (read-only)", () => {
  const authCols = [
    "id","program_id","site_id","host_organization_id","institution_organization_id",
    "version","status","services","requested_by_person_id","requested_at",
    "evidence_document_id","effective_from","effective_through","reviewed_by_person_id",
    "reviewed_at","review_reason","revoked_by_person_id","revoked_at",
    "revocation_reason","created_at","updated_at",
  ];
  const guardianCols = ["can_view_academics","can_manage_enrollment","can_submit_attendance_excuse"];
  // Committed journal timestamps for 0039-0047 (drizzle/meta/_journal.json).
  const stagedEntries = [
    {idx:39,tag:"0039_program_site_authorizations",when:1792731600000},
    {idx:40,tag:"0040_site_local_content",when:1792735200000},
    {idx:41,tag:"0041_pending_guardian_access_defaults",when:1792738800000},
    {idx:42,tag:"0042_public_family_start_requests",when:1792742400000},
    {idx:43,tag:"0043_student_access_consents",when:1792746000000},
    {idx:44,tag:"0044_school_configuration_operating_approval",when:1792749600000},
    {idx:45,tag:"0045_onsite_safety_qualification_definitions",when:1792753200000},
    {idx:46,tag:"0046_conference_booking_cancellation",when:1793154285012},
    {idx:47,tag:"0047_ancient_may_parker",when:1793225613547},
  ];
  function stateThrough0040() {
    const base = reviewedState();
    base.journal.entries.push(...stagedEntries);
    return {
      ...base, applied:41, lastTimestamp:"1792735200000",
      types:[...base.types,
        {typname:"program_type",enumlabel:"summer_program"},
        {typname:"program_type",enumlabel:"after_school_enrichment"},
        {typname:"activity_season_status",enumlabel:"draft"},
      ],
      columns:[
        {table_name:"programs",column_name:"credit_issuing_organization_id",is_nullable:"YES"},
        {table_name:"activity_seasons",column_name:"metadata",is_nullable:"NO"},
        {table_name:"activity_registrations",column_name:"metadata",is_nullable:"NO"},
      ],
      tables:["site_publications","program_publications","public_admissions_interests",
        "program_site_authorizations","site_local_content_versions"].map(table_name=>({table_name})),
      authorizationColumns:authCols.map(column_name=>({column_name})),
      authorizationIndexes:["program_site_authorization_version_uq",
        "program_site_authorization_current_uq"].map(indexname=>({indexname})),
      authorizationConstraints:[
        "program_site_authorization_status_ck","program_site_authorization_review_ck",
        "program_site_authorization_revoked_ck","program_site_authorization_distinct_review_ck",
        "program_site_authorization_services_ck",
      ].map(conname=>({conname})),
      localCopyColumns:[
        "id","site_id","revision","status","content","flagged_fields",
        "created_by_person_id","restored_from_revision","created_at",
      ].map(column_name=>({column_name})),
      localCopyIndexes:["site_local_content_site_revision_uq",
        "site_local_content_site_status_idx"].map(indexname=>({indexname})),
      localCopyConstraints:[
        "site_local_content_positive_revision_ck","site_local_content_status_ck",
        "site_local_content_document_ck","site_local_content_flagged_ck",
      ].map(conname=>({conname})),
      // 0041 not yet applied: pending-guardian capabilities still default true.
      guardianDefaults:guardianCols.map(column_name=>({column_name,column_default:"true"})),
    };
  }
  function stateThrough0041() {
    const state = stateThrough0040();
    return {...state, applied:42, lastTimestamp:"1792738800000",
      guardianDefaults:guardianCols.map(column_name=>({column_name,column_default:"false"}))};
  }
  function stateThrough0042() {
    const state = stateThrough0041();
    return {...state, applied:43, lastTimestamp:"1792742400000",
      tables:[...state.tables,{table_name:"public_family_start_requests"}],
      familyStartColumns:[
        "id","site_id","program_id","email_normalized","adult_first_name",
        "adult_last_name","token_hash","expires_at","consumed_at","created_at",
      ].map(column_name=>({column_name})),
      familyStartIndexes:["public_family_starts_token_uq","public_family_starts_expiry_idx",
        "public_family_starts_school_idx"].map(indexname=>({indexname}))};
  }
  function stateThrough0043() {
    const state = stateThrough0042();
    return {...state, applied:44, lastTimestamp:"1792746000000",
      tables:[...state.tables,{table_name:"student_access_consents"}],
      consentColumns:[
        "id","application_id","student_profile_id","guardian_person_id",
        "program_id","site_id","student_email","consent_statement",
        "signed_at","reviewed_by_person_id","reviewed_at","status",
        "created_at","updated_at",
      ].map(column_name=>({column_name})),
      consentIndexes:["student_access_consent_application_uq",
        "student_access_consent_reviewer_idx"].map(indexname=>({indexname}))};
  }
  function stateThrough0044() {
    const state = stateThrough0043();
    return {...state, applied:45, lastTimestamp:"1792749600000",
      types:[...state.types,
        {typname:"school_configuration_status",enumlabel:"approved"},
        {typname:"school_configuration_status",enumlabel:"suspended"}]};
  }
  function stateThrough0045() {
    const state = stateThrough0044();
    return {...state, applied:46, lastTimestamp:"1792753200000",
      safetyQualificationKeys:["onsite_child_safety_screening","onsite_safeguarding_training"]
        .map(key=>({key}))};
  }
  function stateThrough0046() {
    const state = stateThrough0045();
    return {...state, applied:47, lastTimestamp:"1793154285012",
      types:[...state.types,
        {typname:"conference_booking_status",enumlabel:"cancelled"}],
      conferenceBookingIndexes:[{
        indexname:"conference_slot_booking_uq",
        indexdef:"CREATE UNIQUE INDEX conference_slot_booking_uq ON public.conference_bookings USING btree (conference_slot_id) WHERE (status <> 'cancelled'::conference_booking_status)",
      }]};
  }
  function stateThrough0047() {
    const state = stateThrough0046();
    const p0Tables = ["pickup_authorizations","pickup_custody_holds","pickup_release_events",
      "safeguarding_case_assignments","safeguarding_concerns","safeguarding_external_reports",
      "safeguarding_site_policies","safeguarding_site_responders"];
    const p0Indexes = ["pickup_authorization_source_key_uq","pickup_authorization_roster_idx",
      "pickup_authorization_person_idx","pickup_authorization_household_idx",
      "pickup_custody_hold_source_key_uq","pickup_custody_hold_roster_idx",
      "pickup_custody_hold_household_idx","pickup_release_event_source_key_uq",
      "pickup_release_event_roster_idx","pickup_release_event_attendance_idx",
      "pickup_release_event_site_time_idx","safeguarding_case_assignment_uq",
      "safeguarding_case_assignment_person_idx","safeguarding_case_assignment_incident_idx",
      "safeguarding_concern_reporter_idempotency_uq","safeguarding_concern_student_idx",
      "safeguarding_external_report_idempotency_uq","safeguarding_external_report_incident_idx",
      "safeguarding_site_policy_site_uq","safeguarding_site_responder_role_uq",
      "safeguarding_site_responder_person_idx","incident_evidence_actor_idempotency_uq"];
    return {...state, applied:48, lastTimestamp:"1793225613547",
      tables:[...state.tables,...p0Tables.map(table_name=>({table_name}))],
      p0SafetyColumns:[
        {table_name:"guardian_relationships",column_name:"can_manage_pickup"},
        {table_name:"incident_evidence",column_name:"idempotency_key"},
      ],
      p0SafetyIndexes:p0Indexes.map(indexname=>({indexname}))};
  }
  it("permits staged 0041 through 0047 application on the dedicated branch", () => {
    expect(assessFullFlowMigrationReadiness(stateThrough0040())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0041_pending_guardian_access_defaults","0042_public_family_start_requests",
        "0043_student_access_consents","0044_school_configuration_operating_approval",
        "0045_onsite_safety_qualification_definitions","0046_conference_booking_cancellation",
        "0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0041())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0042_public_family_start_requests","0043_student_access_consents",
        "0044_school_configuration_operating_approval","0045_onsite_safety_qualification_definitions",
        "0046_conference_booking_cancellation","0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0042())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0043_student_access_consents","0044_school_configuration_operating_approval",
        "0045_onsite_safety_qualification_definitions","0046_conference_booking_cancellation",
        "0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0043())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0044_school_configuration_operating_approval",
        "0045_onsite_safety_qualification_definitions","0046_conference_booking_cancellation",
        "0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0044())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0045_onsite_safety_qualification_definitions",
        "0046_conference_booking_cancellation","0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0045())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0046_conference_booking_cancellation","0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0046())).toMatchObject({
      ready:true,status:"PRECONDITIONS_MATCH_NOT_APPLIED",
      pendingMigrations:["0047_ancient_may_parker"],
    });
    expect(assessFullFlowMigrationReadiness(stateThrough0047())).toMatchObject({
      ready:true,status:"UP_TO_DATE",pendingMigrations:[],
    });
  });
  it("rejects partial 0041-0046 drift, premature artifacts and wrong branch", () => {
    const through0041 = stateThrough0041();
    const through0042 = stateThrough0042();
    const through0043 = stateThrough0043();
    const through0044 = stateThrough0044();
    const through0045 = stateThrough0045();
    const through0046 = stateThrough0046();
    for (const changed of [
      // 0041 recorded in the ledger but defaults never flipped
      {...through0041, guardianDefaults:through0041.guardianDefaults
        .map(x=>({...x,column_default:"true"}))},
      {...through0042, familyStartColumns:through0042.familyStartColumns
        .filter(x=>x.column_name!=="token_hash")},
      {...through0042, familyStartIndexes:through0042.familyStartIndexes
        .filter(x=>x.indexname!=="public_family_starts_token_uq")},
      {...through0043, consentColumns:through0043.consentColumns
        .filter(x=>x.column_name!=="consent_statement")},
      {...through0043, consentIndexes:through0043.consentIndexes
        .filter(x=>x.indexname!=="student_access_consent_application_uq")},
      {...through0044, types:through0044.types.filter(x=>x.enumlabel!=="suspended")},
      {...through0045, safetyQualificationKeys:through0045.safetyQualificationKeys
        .filter(x=>x.key!=="onsite_safeguarding_training")},
      {...through0045, lastTimestamp:"1792749600000"},
      {...through0045, applied:45},
      // 0046 recorded in the ledger but its invariants are missing
      {...through0046, types:through0046.types.filter(x=>x.enumlabel!=="cancelled")},
      {...through0046, conferenceBookingIndexes:[]},
      // 0046 index recreated without its partial WHERE predicate
      {...through0046, conferenceBookingIndexes:[{
        indexname:"conference_slot_booking_uq",
        indexdef:"CREATE UNIQUE INDEX conference_slot_booking_uq ON public.conference_bookings USING btree (conference_slot_id)",
      }]},
      {...through0046, lastTimestamp:"1792753200000"},
      {...through0046, applied:46},
      {...through0045, branch:"br-restless-sea-ar9ooo55"},
      {...through0045, branch:"br-bitter-feather-ar0u63x7"},
      {...through0046, branch:"br-restless-sea-ar9ooo55"},
      {...through0046, branch:"br-bitter-feather-ar0u63x7"},
    ]) {
      expect(assessFullFlowMigrationReadiness(changed).ready).toBe(false);
    }
    const early = stateThrough0040();
    for (const premature of [
      // 0041 defaults flipped before the migration ran
      {...early, guardianDefaults:early.guardianDefaults
        .map(x=>({...x,column_default:"false"}))},
      // 0042/0043 tables created before their migrations ran
      {...early, tables:[...early.tables,{table_name:"public_family_start_requests"}]},
      {...through0042, tables:[...through0042.tables,{table_name:"student_access_consents"}]},
      // 0044 enum values present before the migration ran
      {...through0043, types:[...through0043.types,
        {typname:"school_configuration_status",enumlabel:"approved"}]},
      // 0045 catalog rows seeded before the migration ran
      {...through0044, safetyQualificationKeys:[{key:"onsite_child_safety_screening"}]},
      // 0046 enum value present before the migration ran
      {...through0045, types:[...through0045.types,
        {typname:"conference_booking_status",enumlabel:"cancelled"}]},
    ]) {
      expect(assessFullFlowMigrationReadiness(premature).ready).toBe(false);
    }
  });
  it("rejects partial or premature 0047 safeguarding and pickup artifacts", () => {
    const before = stateThrough0046();
    const complete = stateThrough0047();
    for (const changed of [
      {...before, tables:[...before.tables,{table_name:"pickup_authorizations"}]},
      {...before, p0SafetyColumns:[{table_name:"guardian_relationships",column_name:"can_manage_pickup"}]},
      {...before, p0SafetyIndexes:[{indexname:"pickup_authorization_source_key_uq"}]},
      {...complete, tables:complete.tables.filter(x=>x.table_name!=="pickup_release_events")},
      {...complete, p0SafetyColumns:complete.p0SafetyColumns.filter(x=>x.column_name!=="idempotency_key")},
      {...complete, p0SafetyIndexes:complete.p0SafetyIndexes.filter(x=>x.indexname!=="safeguarding_case_assignment_uq")},
    ]) {
      expect(assessFullFlowMigrationReadiness(changed).ready).toBe(false);
    }
  });
});
