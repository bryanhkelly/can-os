/**
 * Self-contained synthetic fixture for the GF1 golden-flow e2e test.
 *
 * Everything is written directly to Neon over the serverless HTTP driver so the
 * spec never depends on seed scripts or app internals beyond the auth token
 * helpers. Every row uses fresh UUIDs and a unique suffix per run, and
 * destroyGf1Fixture removes the whole graph in FK-safe order so the test is
 * repeatable against the same disposable database.
 *
 * Column names were verified against src/db/schema/*. (organizations.ts,
 * academic-time.ts, academics.ts, identity.ts, access.ts, work.ts).
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { createAccessSession } from "./helpers/authenticated-persona";
import {
  createCanonicalSection,
  createHighSchoolExtensionProgram,
  createOrganization,
  createSite,
  createSyntheticPersonaGrant,
  createVerifiedAccessAccount,
  insertFixtureId,
} from "./helpers/canonical-fixture";

export type Sql = NeonQueryFunction<false, false>;

export interface Gf1Fixture {
  suffix: string;
  jurisdictionId: string;
  canOrgId: string;
  hostOrgId: string;
  siteId: string;
  programId: string;
  gradeScaleId: string;
  schoolYearId: string;
  termId: string;
  courseTemplateId: string;
  courseTemplateVersionId: string;
  sectionId: string;
  assessmentId: string;
  submissionId: string;
  teacherPersonId: string;
  studentPersonId: string;
  guardianPersonId: string;
  specialistPersonId: string;
  studentProfileId: string;
  studentAccountId: string;
  teacherAccountId: string;
  guardianAccountId: string;
  specialistAccountId: string;
  studentGrantId: string;
  teacherGrantId: string;
  guardianGrantId: string;
  specialistGrantId: string;
  /** Non-synthetic provider-wide teacher grant required by teaching eligibility. */
  teacherProviderGrantId: string;
  /** Provider-owned Program teacher delegation required by teaching eligibility. */
  teacherRoleAssignmentId: string;
  complianceFrameworkId: string;
  complianceFrameworkVersionId: string;
  policyRuleId: string;
  policyApplicabilityId: string;
  qualificationDefinitionId: string;
  qualificationClaimId: string;
  qualificationVerificationEventId: string;
  /** Active delivery arrangement covering the whole instructional window. */
  deliveryArrangementId: string;
  /** Raw session secrets — the browser only ever sees these, never the hashes. */
  studentSecret: string;
  teacherSecret: string;
  guardianSecret: string;
  specialistSecret: string;
  assessmentTitle: string;
}

/**
 * Builds the full GF1 graph: Org -> Site -> Program, school year/term, section
 * with a teacher, an enrolled student with a guardian, a published synthetic
 * assessment due in the past, and an assigned on-time submission. Also creates
 * passwordless access accounts/grants for all three personas and ready-to-use
 * sessions for the student and teacher (same shape the app creates after
 * redeeming an email challenge — there is intentionally no app backdoor).
 */
export async function createGf1Fixture(sql: Sql): Promise<Gf1Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const dueAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // overdue yesterday
  const availableAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const sessionExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const fixture: Partial<Gf1Fixture> = { suffix };
  try {
    fixture.jurisdictionId = await insertFixtureId(
      sql,
      `insert into jurisdictions (code, name, configuration)
       values ($1, $2, '{}'::jsonb) returning id`,
      [`e2e-${suffix}`, "E2E Golden Flow"],
    );

    fixture.canOrgId = await createOrganization(sql, {
      type: "can_network",
      name: `E2E CAN Network ${suffix}`,
      slug: `e2e-can-${suffix}`,
    });

    fixture.hostOrgId = await createOrganization(sql, {
      type: "christian_school",
      name: `E2E Host School ${suffix}`,
      slug: `e2e-host-${suffix}`,
    });

    fixture.siteId = await createSite(sql, {
      organizationId: fixture.hostOrgId,
      name: "E2E Campus",
      slug: `e2e-campus-${suffix}`,
    });

    fixture.programId = await createHighSchoolExtensionProgram(sql, {
      hostOrganizationId: fixture.hostOrgId,
      siteId: fixture.siteId,
      jurisdictionId: fixture.jurisdictionId,
      academicProviderOrganizationId: fixture.canOrgId,
      creditIssuingOrganizationId: fixture.canOrgId,
      name: "E2E High School",
      slug: `e2e-hs-${suffix}`,
    });

    fixture.gradeScaleId = await insertFixtureId(
      sql,
      `insert into grade_scales (owning_organization_id, name, version, configuration, effective_from)
       values ($1, $2, 1, $3::jsonb, '2026-08-01') returning id`,
      [
        fixture.hostOrgId,
        "E2E Standard 4.0",
        JSON.stringify({
          entries: [
            { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
            { label: "B", minPercent: 80, maxPercent: 89.99, gpaPoints: 3, passing: true },
            { label: "C", minPercent: 70, maxPercent: 79.99, gpaPoints: 2, passing: true },
            { label: "D", minPercent: 60, maxPercent: 69.99, gpaPoints: 1, passing: true },
            { label: "F", minPercent: 0, maxPercent: 59.99, gpaPoints: 0, passing: false },
          ],
        }),
      ],
    );

    fixture.schoolYearId = await insertFixtureId(
      sql,
      `insert into school_years (
         organization_id, program_id, site_id, key, name, status,
         starts_on, ends_on, grade_scale_id, timezone, metadata
       ) values ($1, $2, $3, $4, '2026–2027', 'active',
         '2026-08-16', '2027-06-04', $5, 'America/Los_Angeles', '{}'::jsonb) returning id`,
      [
        fixture.hostOrgId,
        fixture.programId,
        fixture.siteId,
        `2026-2027-${suffix}`,
        fixture.gradeScaleId,
      ],
    );

    fixture.termId = await insertFixtureId(
      sql,
      `insert into terms (school_year_id, key, name, sequence, starts_on, ends_on)
       values ($1, $2, 'Fall Semester', 1, '2026-08-16', '2026-12-18') returning id`,
      [fixture.schoolYearId, `fall-${suffix}`],
    );

    fixture.courseTemplateId = await insertFixtureId(
      sql,
      `insert into course_templates (owning_organization_id, code, title, subject, metadata)
       values ($1, $2, 'E2E Logic II', 'Logic', '{}'::jsonb) returning id`,
      [fixture.canOrgId, `E2E-LOGIC-${suffix}`],
    );

    fixture.courseTemplateVersionId = await insertFixtureId(
      sql,
      `insert into course_template_versions (course_template_id, version, status, curriculum, published_at)
       values ($1, 1, 'published', '{}'::jsonb, now()) returning id`,
      [fixture.courseTemplateId],
    );

    fixture.sectionId = await createCanonicalSection(sql, {
      programId: fixture.programId,
      siteId: fixture.siteId,
      courseTemplateVersionId: fixture.courseTemplateVersionId,
      code: `E2E-SEC-${suffix}`,
      title: "E2E Logic II",
      termId: fixture.termId,
    });

    // People. The student (and peers) must carry metadata.synthetic=true: the
    // teacher missing-work queue and the synthetic assignment mutations only
    // touch explicitly synthetic records.
    const synthetic = JSON.stringify({ synthetic: true, fixture: "gf1-e2e" });
    fixture.teacherPersonId = await insertFixtureId(
      sql,
      `insert into people (legal_first_name, legal_last_name, email, metadata)
       values ('E2E Riley', $1, $2, $3::jsonb) returning id`,
      [`Teacher-${suffix}`, `e2e-teacher-${suffix}@can-os.invalid`, synthetic],
    );
    fixture.studentPersonId = await insertFixtureId(
      sql,
      `insert into people (legal_first_name, legal_last_name, preferred_name, email, metadata)
       values ('E2E Jordan', $1, 'Jordan', $2, $3::jsonb) returning id`,
      [`Student-${suffix}`, `e2e-student-${suffix}@can-os.invalid`, synthetic],
    );
    fixture.guardianPersonId = await insertFixtureId(
      sql,
      `insert into people (legal_first_name, legal_last_name, email, metadata)
       values ('E2E Morgan', $1, $2, $3::jsonb) returning id`,
      [`Guardian-${suffix}`, `e2e-guardian-${suffix}@can-os.invalid`, synthetic],
    );
    fixture.specialistPersonId = await insertFixtureId(
      sql,
      `insert into people (legal_first_name, legal_last_name, email, metadata)
       values ('E2E Casey', $1, $2, $3::jsonb) returning id`,
      [`Specialist-${suffix}`, `e2e-specialist-${suffix}@can-os.invalid`, synthetic],
    );

    fixture.studentProfileId = await insertFixtureId(
      sql,
      `insert into student_profiles (person_id, grade_level, metadata)
       values ($1, '10', '{}'::jsonb) returning id`,
      [fixture.studentPersonId],
    );

    // canViewAcademics=true is what lets the domain-event worker notify this guardian.
    await sql.query(
      `insert into guardian_relationships (
         guardian_person_id, student_person_id, relationship_label, can_view_academics, metadata
       ) values ($1, $2, 'parent', true, '{}'::jsonb)`,
      [fixture.guardianPersonId, fixture.studentPersonId],
    );

    await sql.query(
      `insert into section_teachers (section_id, person_id, role)
       values ($1, $2, 'teacher')`,
      [fixture.sectionId, fixture.teacherPersonId],
    );

    // Canonical enrollments: an active Program membership (section_id NULL)
    // AND the active Section membership. Class access requires both.
    await sql.query(
      `insert into enrollments (
         student_profile_id, kind, status, organization_id, program_id, section_id, school_year_id, metadata
       ) values ($1, 'program', 'active', $2, $3, null, $4, '{}'::jsonb)`,
      [
        fixture.studentProfileId,
        fixture.hostOrgId,
        fixture.programId,
        fixture.schoolYearId,
      ],
    );
    await sql.query(
      `insert into enrollments (
         student_profile_id, kind, status, organization_id, program_id, section_id, school_year_id, metadata
       ) values ($1, 'section', 'active', $2, $3, $4, $5, '{}'::jsonb)`,
      [
        fixture.studentProfileId,
        fixture.hostOrgId,
        fixture.programId,
        fixture.sectionId,
        fixture.schoolYearId,
      ],
    );

    fixture.assessmentTitle = `E2E Problem Set ${suffix}`;
    fixture.assessmentId = await insertFixtureId(
      sql,
      `insert into assessments (
         section_id, title, instructions, status, points_possible,
         available_at, due_at, metadata, created_by_person_id
       ) values ($1, $2, 'Show your work.', 'published', '100',
         $3, $4, $5::jsonb, $6) returning id`,
      [
        fixture.sectionId,
        fixture.assessmentTitle,
        availableAt.toISOString(),
        dueAt.toISOString(),
        JSON.stringify({ synthetic: true, fixture: "gf1-e2e" }),
        fixture.teacherPersonId,
      ],
    );

    fixture.submissionId = await insertFixtureId(
      sql,
      `insert into submissions (
         assessment_id, student_profile_id, status, timeliness, response, feedback
       ) values ($1, $2, 'assigned', 'on_time', '{}'::jsonb, '{}'::jsonb) returning id`,
      [fixture.assessmentId, fixture.studentProfileId],
    );

    // Passwordless accounts + grants, mirroring scripts/seeds/identity-demo-accounts.sql.
    const accountFor = async (email: string) => createVerifiedAccessAccount(sql, email);
    fixture.studentAccountId = await accountFor(`e2e-student-${suffix}@can-os.invalid`);
    fixture.teacherAccountId = await accountFor(`e2e-teacher-${suffix}@can-os.invalid`);
    fixture.guardianAccountId = await accountFor(`e2e-guardian-${suffix}@can-os.invalid`);
    fixture.specialistAccountId = await accountFor(`e2e-specialist-${suffix}@can-os.invalid`);

    const grantFor = async (accountId: string, personId: string, role: string) =>
      createSyntheticPersonaGrant(sql, {
        accountId,
        personId,
        role,
        organizationId: fixture.hostOrgId!,
        siteId: fixture.siteId!,
      });
    fixture.studentGrantId = await grantFor(fixture.studentAccountId, fixture.studentPersonId, "student");
    fixture.teacherGrantId = await grantFor(fixture.teacherAccountId, fixture.teacherPersonId, "teacher");
    fixture.guardianGrantId = await grantFor(fixture.guardianAccountId, fixture.guardianPersonId, "guardian");
    fixture.specialistGrantId = await grantFor(fixture.specialistAccountId, fixture.specialistPersonId, "specialist");

    // Canonical teaching-eligibility stack (mirrors
    // scripts/seeds/synthetic-profiles-compliance.sql plus the role-assignment
    // pattern in algebra1-classroom.spec.ts). requireTeachingEligibility needs:
    // a provider-owned Program teacher role assignment, a NON-synthetic
    // provider-wide teacher grant on a verified account, a published compliance
    // policy the teacher's verified qualification satisfies across the whole
    // instructional window, and active delivery coverage for that window.
    fixture.teacherRoleAssignmentId = await insertFixtureId(
      sql,
      `insert into role_assignments (person_id, organization_id, site_id, program_id, role_key, capabilities)
       values ($1, $2, $3, $4, 'teacher', '["academic_instruction","curriculum"]'::jsonb) returning id`,
      [fixture.teacherPersonId, fixture.canOrgId, fixture.siteId, fixture.programId],
    );
    fixture.teacherProviderGrantId = await insertFixtureId(
      sql,
      `insert into account_person_grants (account_id, person_id, role, organization_id, site_id, active, is_synthetic)
       values ($1, $2, 'teacher', $3, null, true, false) returning id`,
      [fixture.teacherAccountId, fixture.teacherPersonId, fixture.canOrgId],
    );

    fixture.qualificationDefinitionId = await insertFixtureId(
      sql,
      `insert into qualification_definitions (key, kind, title)
       values ($1, 'license', 'E2E Teaching License') returning id`,
      [`e2e-teaching-license-${suffix}`],
    );
    fixture.qualificationClaimId = await insertFixtureId(
      sql,
      `insert into qualification_claims (person_id, definition_id, issuer_name, jurisdiction_id, issued_at, expires_at, details)
       values ($1, $2, 'E2E Synthetic Issuer', $3, null, null, '{"synthetic":true}'::jsonb) returning id`,
      [fixture.teacherPersonId, fixture.qualificationDefinitionId, fixture.jurisdictionId],
    );
    fixture.qualificationVerificationEventId = await insertFixtureId(
      sql,
      `insert into qualification_verification_events (claim_id, sequence, decision, actor_person_id)
       values ($1, 1, 'approve', $2) returning id`,
      [fixture.qualificationClaimId, fixture.teacherPersonId],
    );

    fixture.complianceFrameworkId = await insertFixtureId(
      sql,
      `insert into compliance_frameworks (key, name, authority)
       values ($1, 'E2E Staff Readiness', 'CAN E2E Only') returning id`,
      [`e2e-staff-readiness-${suffix}`],
    );
    fixture.complianceFrameworkVersionId = await insertFixtureId(
      sql,
      `insert into compliance_framework_versions (framework_id, version, status)
       values ($1, '1', 'published') returning id`,
      [fixture.complianceFrameworkId],
    );
    fixture.policyRuleId = await insertFixtureId(
      sql,
      `insert into compliance_policy_rules (framework_version_id, code, description, expression, evidence_policy)
       values ($1, 'E2E-LICENSE', 'E2E teaching license for synthetic browser runs', $2::jsonb, '{}'::jsonb) returning id`,
      [
        fixture.complianceFrameworkVersionId,
        JSON.stringify({ op: "credential", type: `e2e-teaching-license-${suffix}` }),
      ],
    );
    fixture.policyApplicabilityId = await insertFixtureId(
      sql,
      `insert into compliance_policy_applicability (
         framework_version_id, organization_id, site_id, program_id, jurisdiction_id, role_key
       ) values ($1, null, null, null, null, 'teacher') returning id`,
      [fixture.complianceFrameworkVersionId],
    );

    fixture.deliveryArrangementId = await insertFixtureId(
      sql,
      `insert into delivery_arrangements (
         section_id, academic_provider_organization_id, instructor_person_id,
         modality, status, effective_from, effective_through, metadata
       ) values ($1, $2, $3, 'hybrid', 'active', '2026-08-01', '2027-06-30', $4::jsonb) returning id`,
      [
        fixture.sectionId,
        fixture.canOrgId,
        fixture.teacherPersonId,
        JSON.stringify({ synthetic: true, fixture: "gf1-e2e" }),
      ],
    );

    // Sessions use the same helper as independently provisioned browser personas.
    const sessionFor = async (accountId: string, grantId: string) =>
      createAccessSession(sql, { accountId, activeGrantId: grantId, expiresAt: sessionExpiresAt });
    fixture.studentSecret = await sessionFor(fixture.studentAccountId, fixture.studentGrantId);
    fixture.teacherSecret = await sessionFor(fixture.teacherAccountId, fixture.teacherGrantId);
    fixture.guardianSecret = await sessionFor(fixture.guardianAccountId, fixture.guardianGrantId);
    fixture.specialistSecret = await sessionFor(fixture.specialistAccountId, fixture.specialistGrantId);

    return fixture as Gf1Fixture;
  } catch (error) {
    // Best-effort cleanup so a half-built fixture never blocks the next run.
    await destroyGf1Fixture(sql, fixture).catch(() => undefined);
    throw error;
  }
}

/** Deletes the fixture graph in FK-safe order. Tolerates partially built fixtures. */
export async function destroyGf1Fixture(
  sql: Sql,
  fixture: Partial<Gf1Fixture>,
): Promise<void> {
  const one = (text: string, id: string | undefined): [string, unknown[] | undefined] => [
    text,
    id ? [id] : undefined,
  ];
  const steps: Array<[string, unknown[] | undefined]> = [
    // Side-effect tables first (they hold plain UUID references or restrict FKs).
    ...[fixture.studentPersonId, fixture.guardianPersonId, fixture.teacherPersonId, fixture.specialistPersonId].map(
      (id) => one(`delete from notifications where recipient_person_id = $1`, id),
    ),
    ...[fixture.submissionId, fixture.assessmentId].map((id) =>
      one(`delete from audit_events where resource_id = $1`, id),
    ),
    one(`delete from insights where section_id = $1`, fixture.sectionId),
    ...[fixture.submissionId, fixture.assessmentId].map((id) =>
      one(`delete from domain_events where aggregate_id = $1`, id),
    ),
    // Auth graph.
    ...[fixture.studentAccountId, fixture.teacherAccountId, fixture.guardianAccountId, fixture.specialistAccountId].map(
      (id) => one(`delete from access_sessions where account_id = $1`, id),
    ),
    ...[fixture.studentGrantId, fixture.teacherGrantId, fixture.guardianGrantId, fixture.specialistGrantId,
      fixture.teacherProviderGrantId].map(
      (id) => one(`delete from account_person_grants where id = $1`, id),
    ),
    ...[fixture.studentAccountId, fixture.teacherAccountId, fixture.guardianAccountId, fixture.specialistAccountId].map(
      (id) => one(`delete from access_accounts where id = $1`, id),
    ),
    // Academic graph, children before parents.
    one(`delete from submissions where id = $1`, fixture.submissionId),
    one(`delete from assessments where id = $1`, fixture.assessmentId),
    one(`delete from section_teachers where section_id = $1`, fixture.sectionId),
    // Both the Program (section_id NULL) and Section memberships belong to
    // this profile; deleting by section alone would leak the Program row.
    one(`delete from enrollments where student_profile_id = $1`, fixture.studentProfileId),
    one(`delete from delivery_arrangements where id = $1`, fixture.deliveryArrangementId),
    one(`delete from sections where id = $1`, fixture.sectionId),
    one(`delete from course_template_versions where id = $1`, fixture.courseTemplateVersionId),
    one(`delete from course_templates where id = $1`, fixture.courseTemplateId),
    one(`delete from terms where id = $1`, fixture.termId),
    one(`delete from school_years where id = $1`, fixture.schoolYearId),
    one(`delete from grade_scales where id = $1`, fixture.gradeScaleId),
    [
      `delete from guardian_relationships where guardian_person_id = $1 and student_person_id = $2`,
      fixture.guardianPersonId && fixture.studentPersonId
        ? [fixture.guardianPersonId, fixture.studentPersonId]
        : undefined,
    ],
    one(`delete from student_profiles where id = $1`, fixture.studentProfileId),
    // Teaching-eligibility graph, children before parents.
    one(`delete from qualification_verification_events where id = $1`, fixture.qualificationVerificationEventId),
    one(`delete from qualification_claims where id = $1`, fixture.qualificationClaimId),
    one(`delete from compliance_policy_applicability where id = $1`, fixture.policyApplicabilityId),
    one(`delete from compliance_policy_rules where id = $1`, fixture.policyRuleId),
    one(`delete from compliance_framework_versions where id = $1`, fixture.complianceFrameworkVersionId),
    one(`delete from compliance_frameworks where id = $1`, fixture.complianceFrameworkId),
    one(`delete from qualification_definitions where id = $1`, fixture.qualificationDefinitionId),
    one(`delete from role_assignments where id = $1`, fixture.teacherRoleAssignmentId),
    ...[fixture.teacherPersonId, fixture.studentPersonId, fixture.guardianPersonId, fixture.specialistPersonId].map(
      (id) => one(`delete from people where id = $1`, id),
    ),
    // Delivery hierarchy, children before parents.
    one(`delete from programs where id = $1`, fixture.programId),
    one(`delete from sites where id = $1`, fixture.siteId),
    ...[fixture.hostOrgId, fixture.canOrgId].map((id) =>
      one(`delete from organizations where id = $1`, id),
    ),
    one(`delete from jurisdictions where id = $1`, fixture.jurisdictionId),
  ];

  for (const [text, params] of steps) {
    if (!params) continue;
    await sql.query(text, params);
  }
}
