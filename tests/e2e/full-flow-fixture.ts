import { randomUUID } from "node:crypto";
import type { Sql } from "./fixture";
import {
  createAccessSession,
} from "./helpers/authenticated-persona";
import {
  createOrganization,
  createSite,
  createVerifiedAccessAccount,
  insertFixtureId,
} from "./helpers/canonical-fixture";

/**
 * Bootstrap for the persistent multi-role FullFlow browser acceptance
 * (docs/full-flow-acceptance-contract.md).
 *
 * Only identities, safe catalogs and prerequisites are created here:
 *   - synthetic organizations (school tenant, unrelated second tenant,
 *     publisher), jurisdiction, publisher workspace site/program
 *   - verified synthetic people/accounts/grants/sessions for each persona
 *   - qualification catalog entry, the teacher's verified credential
 *     (the product credential-submission UI requires object storage uploads,
 *     which stay disabled in e2e) and the published compliance policy stack
 *   - journey definition catalogs (program-launch + family enrollment form)
 *
 * The tested Program, adopted course version, section, application,
 * enrollment, submission and grade are NEVER precreated here; they are
 * produced by the browser journey itself.
 */

export interface FullFlowPersona {
  personId: string;
  accountId: string;
  sessionGrantId: string;
  secret: string;
}

export interface FullFlowFixture {
  suffix: string;
  jurisdictionId: string;
  schoolOrgId: string;
  otherSchoolOrgId: string;
  publisherOrgId: string;
  publisherSiteId: string;
  publisherProgramId: string;
  operator: FullFlowPersona;
  publisher: FullFlowPersona;
  teacher: FullFlowPersona & { eligibilityGrantId: string; claimId: string };
  guardian: FullFlowPersona;
  unrelatedGuardian: FullFlowPersona;
  otherOperator: FullFlowPersona;
  qualificationDefinitionId: string;
  qualificationKey: string;
  launchJourneyDefinitionId: string;
  enrollmentJourneyDefinitionId: string;
  enrollmentJourneyDefinitionKey: string;
  programName: string;
  programSlug: string;
  siteName: string;
  siteSlug: string;
  schoolYearName: string;
  courseCode: string;
  courseTitle: string;
  packName: string;
  packSlug: string;
  studentFirstName: string;
  studentLastName: string;
  studentEmail: string;
  // Populated by the journey itself:
  programId?: string;
  siteId?: string;
  schoolYearId?: string;
  termId?: string;
  courseVersionId?: string;
  lessonId?: string;
  sectionId?: string;
  applicationId?: string;
  studentProfileId?: string;
  studentPersonId?: string;
  studentAccountId?: string;
  assessmentId?: string;
}

const SESSION_HORIZON_MS = 12 * 60 * 60 * 1000;

async function createPersona(
  sql: Sql,
  input: {
    name: string;
    email: string;
    role: string;
    organizationId: string;
    siteId?: string | null;
  },
): Promise<FullFlowPersona> {
  const nameParts=input.name.split(" ");
  const legalLastName=nameParts.pop()!;
  const personId = await insertFixtureId(
    sql,
    "insert into people (legal_first_name, legal_last_name) values ($1, $2) returning id",
    [nameParts.join(" "),legalLastName],
  );
  const accountId = await createVerifiedAccessAccount(sql, input.email);
  const grantId = await insertFixtureId(
    sql,
    `insert into account_person_grants (
       account_id, person_id, role, organization_id, site_id, active
     ) values ($1, $2, $3, $4, $5, true) returning id`,
    [
      accountId,
      personId,
      input.role,
      input.organizationId,
      input.siteId ?? null,
    ],
  );
  const secret = await createAccessSession(sql, {
    accountId,
    activeGrantId: grantId,
    expiresAt: new Date(Date.now() + SESSION_HORIZON_MS),
  });
  return { personId, accountId, sessionGrantId: grantId, secret };
}

export async function createFullFlowFixture(sql: Sql): Promise<FullFlowFixture> {
  const suffix = randomUUID().slice(0, 8);

  const jurisdictionId = await insertFixtureId(
    sql,
    "insert into jurisdictions (code, name) values ($1, $2) returning id",
    [`fullflow-${suffix}`,`FullFlow Synthetic State ${suffix}`],
  );
  const schoolOrgId = await createOrganization(sql,{
    type:"christian_school",name:`FullFlow School ${suffix}`,slug:`fullflow-school-${suffix}`,
  });
  const otherSchoolOrgId = await createOrganization(sql,{
    type:"christian_school",name:`FullFlow Other Tenant ${suffix}`,slug:`fullflow-other-${suffix}`,
  });
  const publisherOrgId = await createOrganization(sql,{
    type:"christian_school",name:`FullFlow Publisher ${suffix}`,slug:`fullflow-publisher-org-${suffix}`,
  });
  const publisherSiteId = await createSite(sql,{
    organizationId:publisherOrgId,name:`Publisher HQ ${suffix}`,slug:`fullflow-publisher-site-${suffix}`,
  });
  const publisherProgramId = await insertFixtureId(
    sql,
    `insert into programs (
       organization_id, site_id, type, name, slug, status,
       delivery_model, grade_range,
       academic_provider_organization_id, credit_issuing_organization_id, jurisdiction_id
     ) values ($1, $2, 'full_school', $3, $4, 'active',
               '{"asynchronous":true}'::jsonb, '{"min":"9","max":"12"}'::jsonb,
               $1, $1, $5) returning id`,
    [
      publisherOrgId,
      publisherSiteId,
      `FullFlow Publisher Workspace ${suffix}`,
      `fullflow-publisher-${suffix}`,
      jurisdictionId,
    ],
  );

  const operator = await createPersona(sql, {
    name: `FullFlow School Operator ${suffix}`,
    email: `fullflow-operator-${suffix}@example.test`,
    role: "registrar",
    organizationId: schoolOrgId,
  });
  const publisher = await createPersona(sql, {
    name: `FullFlow Publisher Operator ${suffix}`,
    email: `fullflow-publisher-${suffix}@example.test`,
    role: "registrar",
    organizationId: publisherOrgId,
    siteId: publisherSiteId,
  });
  const teacher = await createPersona(sql, {
    name: `FullFlow Teacher ${suffix}`,
    email: `fullflow-teacher-${suffix}@example.test`,
    role: "teacher",
    organizationId: schoolOrgId,
  });
  const guardian = await createPersona(sql, {
    name: `FullFlow Family Guardian ${suffix}`,
    email: `fullflow-guardian-${suffix}@example.test`,
    role: "guardian",
    organizationId: schoolOrgId,
  });
  const unrelatedGuardian = await createPersona(sql, {
    name: `FullFlow Unrelated Guardian ${suffix}`,
    email: `fullflow-stranger-${suffix}@example.test`,
    role: "guardian",
    organizationId: schoolOrgId,
  });
  const otherOperator = await createPersona(sql, {
    name: `FullFlow Other Tenant Operator ${suffix}`,
    email: `fullflow-other-operator-${suffix}@example.test`,
    role: "registrar",
    organizationId: otherSchoolOrgId,
  });

  // Institutional role assignments + memberships (institutional capability
  // checks require both), all org-wide so they hold for the program created
  // later by the browser journey.
  await sql.query(
    "insert into memberships (person_id, organization_id) values ($1, $2)",
    [operator.personId, schoolOrgId],
  );
  await sql.query(
    "insert into memberships (person_id, organization_id) values ($1, $2)",
    [publisher.personId, publisherOrgId],
  );
  await sql.query(
    `insert into role_assignments (person_id, organization_id, site_id, program_id, role_key, capabilities)
     values ($1, $2, null, null, 'staffing_policy_publisher', '["staffing.policy.publish"]'::jsonb)`,
    [operator.personId, schoolOrgId],
  );
  await sql.query(
    `insert into role_assignments (person_id, organization_id, site_id, program_id, role_key, capabilities)
     values ($1, $2, null, null, 'curriculum_adopter', '["curriculum.adopt"]'::jsonb)`,
    [operator.personId, schoolOrgId],
  );
  await sql.query(
    `insert into role_assignments (person_id, organization_id, site_id, program_id, role_key, capabilities)
     values ($1, $2, $3, $4, 'curriculum_publisher', '["curriculum.publish"]'::jsonb)`,
    [publisher.personId, publisherOrgId, publisherSiteId, publisherProgramId],
  );
  await sql.query(
    `insert into role_assignments (person_id, organization_id, site_id, program_id, role_key, capabilities)
     values ($1, $2, null, null, 'teacher', '["academic_instruction","curriculum"]'::jsonb)`,
    [teacher.personId, schoolOrgId],
  );

  // Teacher eligibility stack: verified provider-wide grant,
  // qualification catalog entry, verified claim covering the instructional
  // window, and a published compliance policy with global teacher
  // applicability (mirrors the GF1 canonical fixture stack).
  const teacherEligibilityGrantId = await insertFixtureId(
    sql,
    `insert into account_person_grants (
       account_id, person_id, role, organization_id, site_id, active
     ) values ($1, $2, 'teacher', $3, null, true) returning id`,
    [teacher.accountId, teacher.personId, schoolOrgId],
  );
  const qualificationKey = `fullflow-instructor-${suffix}`;
  const qualificationDefinitionId = await insertFixtureId(
    sql,
    "insert into qualification_definitions (key, kind, title) values ($1, 'license', $2) returning id",
    [qualificationKey, `FullFlow Algebra Instructor License ${suffix}`],
  );
  const claimId = await insertFixtureId(
    sql,
    `insert into qualification_claims (
       person_id, definition_id, issuer_name, jurisdiction_id,
       issued_at, expires_at, details
     ) values ($1, $2, $3, $4, '2026-01-01', '2028-12-31', '{"synthetic":true}'::jsonb)
     returning id`,
    [
      teacher.personId,
      qualificationDefinitionId,
      "FullFlow Synthetic Issuer",
      jurisdictionId,
    ],
  );
  await sql.query(
    `insert into qualification_verification_events (claim_id, sequence, decision, actor_person_id)
     values ($1, 1, 'approve', $2)`,
    [claimId, operator.personId],
  );
  // Compliance stack is reused across runs by stable key (never duplicated)
  // and applicability is scoped to this fixture's school organization so the
  // shared isolated branch is never polluted with globally-applicable policy.
  const frameworkKey = `fullflow-staff-readiness-${suffix}`;
  const existingFramework = (await sql.query(
    "select id from compliance_frameworks where key = $1",
    [frameworkKey],
  )) as Array<{ id: string }>;
  const complianceFrameworkId = existingFramework[0]?.id ?? await insertFixtureId(
    sql,
    "insert into compliance_frameworks (key, name, authority) values ($1, $2, $3) returning id",
    [
      frameworkKey,
      `FullFlow Staff Readiness ${suffix}`,
      "CAN FullFlow E2E Only",
    ],
  );
  const existingVersion = (await sql.query(
    "select id from compliance_framework_versions where framework_id = $1 and version = '1'",
    [complianceFrameworkId],
  )) as Array<{ id: string }>;
  let complianceFrameworkVersionId: string;
  if (existingVersion[0]?.id) {
    complianceFrameworkVersionId = existingVersion[0].id;
    // A prior run or cleanup may have unpublished this version; restore it.
    await sql.query(
      "update compliance_framework_versions set status = 'published', updated_at = now() where id = $1 and status <> 'published'",
      [complianceFrameworkVersionId],
    );
  } else {
    complianceFrameworkVersionId = await insertFixtureId(
      sql,
      "insert into compliance_framework_versions (framework_id, version, status) values ($1, '1', 'published') returning id",
      [complianceFrameworkId],
    );
  }
  const existingRule = (await sql.query(
    "select id from compliance_policy_rules where framework_version_id = $1 and code = 'FULLFLOW-LICENSE'",
    [complianceFrameworkVersionId],
  )) as Array<{ id: string }>;
  if (!existingRule[0]) {
    await sql.query(
      `insert into compliance_policy_rules (framework_version_id, code, description, expression, evidence_policy)
       values ($1, 'FULLFLOW-LICENSE', 'Licensed instructor required', $2::jsonb, '{}'::jsonb)`,
      [
        complianceFrameworkVersionId,
        JSON.stringify({ op: "credential", type: qualificationKey }),
      ],
    );
  }
  const existingApplicability = (await sql.query(
    `select id from compliance_policy_applicability
     where framework_version_id = $1 and organization_id = $2 and role_key = 'teacher'`,
    [complianceFrameworkVersionId, schoolOrgId],
  )) as Array<{ id: string }>;
  if (!existingApplicability[0]) {
    await sql.query(
      `insert into compliance_policy_applicability (framework_version_id, organization_id, role_key)
       values ($1, $2, 'teacher')`,
      [complianceFrameworkVersionId, schoolOrgId],
    );
  }

  // Journey definition catalogs. The program-launch definition uses a pinned
  // historical created_at so it is the earliest active definition for the
  // well-known key even if demo seed definitions exist on the branch; both
  // blocking requirements are school-owned so the launch UI can complete them.
  const launchJourneyDefinitionId = await insertFixtureId(
    sql,
    `insert into journey_definitions (
       key, version, title, audience, configuration, active,
       owning_organization_id, created_at
     ) values ('program-launch', $1, $2, 'partner', $4::jsonb, true, $3,
               '2020-01-01T00:00:00Z')
     returning id`,
    [
      `fullflow-${suffix}`,
      "FullFlow high-school extension launch",
      schoolOrgId,
      JSON.stringify({
        requirements: [
          { key: "school-readiness", title: "School readiness", blocking: true, owner: "partner" },
          { key: "academic-setup", title: "Academic setup", blocking: true, owner: "partner" },
        ],
      }),
    ],
  );
  const enrollmentJourneyDefinitionKey = `fullflow-enrollment-${suffix}`;
  const enrollmentJourneyDefinitionId = await insertFixtureId(
    sql,
    `insert into journey_definitions (
       key, version, title, audience, configuration, active,
       owning_organization_id, created_at
     ) values ($1, '1', $2, 'family', $4::jsonb, true, $3,
               '2020-01-01T00:00:00Z')
     returning id`,
    [
      enrollmentJourneyDefinitionKey,
      "FullFlow family enrollment",
      schoolOrgId,
      JSON.stringify({
        requirements: [
          { key: "school-review", title: "School enrollment review", blocking: true, owner: "partner" },
          {
            key: "school-consent",
            title: "School enrollment form",
            blocking: true,
            owner: "family",
            enrollmentForm: {
              version: "fullflow-browser-v1",
              instructions: "FullFlow synthetic enrollment form for browser acceptance.",
              consent: "I confirm this FullFlow synthetic enrollment agreement for browser acceptance.",
              fields: [
                { key: "contact_plan", label: "Contact plan", type: "text", required: true },
              ],
            },
          },
        ],
      }),
    ],
  );

  return {
    suffix,
    jurisdictionId,
    schoolOrgId,
    otherSchoolOrgId,
    publisherOrgId,
    publisherSiteId,
    publisherProgramId,
    operator,
    publisher,
    teacher: { ...teacher, eligibilityGrantId: teacherEligibilityGrantId, claimId },
    guardian,
    unrelatedGuardian,
    otherOperator,
    qualificationDefinitionId,
    qualificationKey,
    launchJourneyDefinitionId,
    enrollmentJourneyDefinitionId,
    enrollmentJourneyDefinitionKey,
    programName: `FullFlow High School ${suffix}`,
    programSlug: `fullflow-hs-${suffix}`,
    siteName: `FullFlow Campus ${suffix}`,
    siteSlug: `fullflow-campus-${suffix}`,
    schoolYearName: "2026–2027 School Year",
    courseCode: `FFALG-${suffix.toUpperCase().replace(/[^A-Z0-9]/g, "0")}`,
    courseTitle: "FullFlow Algebra I",
    packName: "FullFlow Algebra I Pack",
    packSlug: `ff-algebra-${suffix}`,
    studentFirstName: "FullFlow",
    studentLastName: `Learner-${suffix}`,
    studentEmail: `fullflow-student-${suffix}@example.test`,
  };
}

/** Site-scoped registrar grant so the operator qualifies as opening operator
 *  for the site created by the stage-1 launch UI. */
export async function grantSiteScopedOperatorRole(
  sql: Sql,
  fixture: FullFlowFixture,
  siteId: string,
): Promise<void> {
  await sql.query(
    `insert into account_person_grants (
       account_id, person_id, role, organization_id, site_id, active
     ) values ($1, $2, 'registrar', $3, $4, true)`,
    [fixture.operator.accountId, fixture.operator.personId, fixture.schoolOrgId, siteId],
  );
}

/** Point the UI-created program at the fixture family-enrollment journey
 *  definition (the program row itself stays the UI-created record). */
export async function pointProgramAtEnrollmentJourney(
  sql: Sql,
  programId: string,
  definitionKey: string,
): Promise<void> {
  await sql.query(
    `update programs
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('enrollmentJourneyDefinitionKey', $2::text)
     where id = $1`,
    [programId, definitionKey],
  );
}

/** Admission seat-pool prerequisite for the UI-created school year. */
export async function createAdmissionSeatPool(
  sql: Sql,
  input: { programId: string; schoolYearId: string; capacity: number },
): Promise<void> {
  await sql.query(
    "insert into admission_seat_pools (program_id, school_year_id, capacity) values ($1, $2, $3)",
    [input.programId, input.schoolYearId, input.capacity],
  );
}

/**
 * Teardown: revoke every session the fixture (or the journey) created,
 * deactivate the grants and disable the accounts so no synthetic identity can
 * authenticate again. The academic graph produced by the journey stays on the
 * disposable branch as the persistent per-run record, namespaced by the run
 * suffix.
 */
export async function retireFullFlowFixture(
  sql: Sql,
  fixture: FullFlowFixture,
): Promise<void> {
  const accountIds = [
    fixture.operator.accountId,
    fixture.publisher.accountId,
    fixture.teacher.accountId,
    fixture.guardian.accountId,
    fixture.unrelatedGuardian.accountId,
    fixture.otherOperator.accountId,
    ...(fixture.studentAccountId ? [fixture.studentAccountId] : []),
  ];
  await sql.query(
    `update access_sessions set revoked_at = now()
     where account_id = any($1::uuid[]) and revoked_at is null`,
    [accountIds],
  );
  await sql.query(
    "update account_person_grants set active = false where account_id = any($1::uuid[])",
    [accountIds],
  );
  await sql.query(
    "update access_accounts set disabled = true where id = any($1::uuid[])",
    [accountIds],
  );
}
