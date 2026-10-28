import { randomUUID } from "node:crypto";
import { createGf1Fixture, type Gf1Fixture, type Sql } from "./fixture";

export type AdmissionsFixture = Gf1Fixture & {
  applicationId: string; householdId: string; definitionId: string; journeyId: string; requirementId: string;
};

export async function createAdmissionsFixture(sql: Sql): Promise<AdmissionsFixture> {
  if (process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test" ||
      process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
      !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
    throw new Error("Admissions browser fixtures require the guarded disposable database runner.");
  // The base GF1 graph already carries the canonical teacher-eligibility and
  // delivery stack verifiedTeacherSectionIds requires (provider role
  // assignment, non-synthetic provider grant, published qualification policy,
  // verified claim, active delivery arrangement); destroyGf1Fixture owns its
  // cleanup.
  const base = await createGf1Fixture(sql);
  const f: AdmissionsFixture = { ...base, applicationId: randomUUID(), householdId: randomUUID(),
    definitionId: randomUUID(), journeyId: randomUUID(), requirementId: randomUUID() };
  const form = { version: "synthetic-browser-v1", instructions: "Synthetic browser acceptance only. This is not a school agreement.",
    consent: "I acknowledge that this synthetic form is only a software acceptance test.",
    fields: [{ key: "contact_plan", label: "Family contact plan", type: "text", required: true }] };
  try {
    await sql.transaction([
      sql.query("delete from enrollments where student_profile_id = $1", [f.studentProfileId]),
      sql.query("delete from submissions where id = $1", [f.submissionId]),
      // This journey authors its first assignment through the teacher UI. Do
      // not satisfy the learning handoff with GF1's pre-created classwork.
      sql.query("delete from assessments where id = $1", [f.assessmentId]),
      // The student must receive access only after guardian consent and the
      // registrar's independent approval. Reuse the canonical account/person,
      // but remove GF1's pre-authorized grant and session until that handoff.
      sql.query("delete from access_sessions where account_id = $1", [f.studentAccountId]),
      sql.query("delete from account_person_grants where id = $1", [f.studentGrantId]),
      sql.query("update access_accounts set email_normalized = $2 where id = $1",
        [f.studentAccountId, `e2e-student-${f.suffix}@example.test`]),
      sql.query("update people set email = $2 where id = $1",
        [f.studentPersonId, `e2e-student-${f.suffix}@example.test`]),
      // Offer response and activation require a canonically verified,
      // enrollment-managing guardian relationship (assertGuardian and the
      // guardian offer inbox both refuse unverified relationships).
      sql.query(`update guardian_relationships set can_manage_enrollment = true,
        metadata = '{"synthetic":true,"fixture":"gf1-e2e","verification":"verified"}'::jsonb
        where guardian_person_id = $1 and student_person_id = $2`,
      [f.guardianPersonId, f.studentPersonId]),
      // Placement refuses a published course version without a learner-facing
      // first lesson (requireAccessibleFirstLesson). Give the inherited version
      // one minimal synthetic lesson; the row itself is owned and removed by
      // the GF1 fixture lifecycle.
      sql.query(`update course_template_versions set curriculum = $2::jsonb
        where id = $1 and status = 'published'`,
      [f.courseTemplateVersionId, JSON.stringify({
        learning: {
          version: 1,
          syllabus: "Synthetic browser acceptance only.",
          modules: [{
            id: "e2e-module-1",
            title: "E2E Module 1",
            lessons: [{
              id: "e2e-lesson-1",
              title: "E2E First Lesson",
              body: "Synthetic first lesson for browser acceptance placement.",
              resources: [],
            }],
          }],
          resources: [],
        },
      })]),
      sql.query("update account_person_grants set role = 'registrar' where id = $1", [f.teacherGrantId]),
      sql.query("insert into households (id, display_name) values ($1, $2)", [f.householdId, `Browser family ${f.suffix}`]),
      sql.query(`insert into household_memberships (household_id, person_id, relationship_label)
        values ($1, $2, 'guardian'), ($1, $3, 'student')`, [f.householdId, f.guardianPersonId, f.studentPersonId]),
      sql.query(`insert into applications (id, household_id, student_profile_id, program_id, stage,
        idempotency_key, submitted_by_person_id, submitted_at, metadata)
        values ($1, $2, $3, $4, 'eligibility', $5, $6, now(), '{"synthetic":true}')`,
      [f.applicationId, f.householdId, f.studentProfileId, f.programId, `browser-admissions-${f.suffix}`, f.guardianPersonId]),
      sql.query(`insert into journey_definitions (id, key, version, owning_organization_id, audience, title, configuration)
        values ($1, $2, '1', $3, 'family', 'Synthetic browser enrollment', $4::jsonb)`,
      [f.definitionId, `browser-admissions-${f.suffix}`, f.hostOrgId,
        JSON.stringify({ requirements: [{ key: "form", title: "School enrollment form", blocking: true, enrollmentForm: form }] })]),
      sql.query(`insert into journeys (id, type, status, participant_type, participant_id, organization_id,
        site_id, program_id, journey_definition_id, definition_version)
        values ($1, 'family_enrollment', 'in_progress', 'application', $2, $3, $4, $5, $6, '1')`,
      [f.journeyId, f.applicationId, f.hostOrgId, f.siteId, f.programId, f.definitionId]),
      sql.query(`insert into journey_requirements (id, journey_id, key, title, blocking, metadata)
        values ($1, $2, 'form', 'School enrollment form', true, $3::jsonb)`,
      [f.requirementId, f.journeyId, JSON.stringify({ enrollmentForm: form })]),
      sql.query("insert into admission_seat_pools (program_id, school_year_id, capacity) values ($1, $2, 1)",
        [f.programId, f.schoolYearId]),
      sql.query(`insert into section_registration_policies (section_id, enrollment_capacity, add_drop_ends_on, withdrawal_ends_on)
        values ($1, 1, '2099-01-01', '2099-02-01')`, [f.sectionId]),
    ]);
    return f;
  } catch (error) {
    try { await retireAdmissionsFixture(sql, f); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Admissions setup and session retirement failed."); }
    throw error;
  }
}

export async function retireAdmissionsFixture(sql: Sql, f: AdmissionsFixture) {
  const accountIds = [f.studentAccountId, f.guardianAccountId, f.teacherAccountId, f.specialistAccountId];
  await sql.transaction([
    sql.query("update access_sessions set revoked_at = now() where account_id = any($1::uuid[])", [accountIds]),
    sql.query("update account_person_grants set active = false where account_id = any($1::uuid[])", [accountIds]),
    sql.query("update access_accounts set disabled = true where id = any($1::uuid[])", [accountIds]),
  ]);
  const remaining = await sql.query(`select id from access_sessions where account_id = any($1::uuid[]) and revoked_at is null
    union all select id from account_person_grants where account_id = any($1::uuid[]) and active = true
    union all select id from access_accounts where id = any($1::uuid[]) and disabled = false`, [accountIds]);
  if (remaining.length) throw new Error("Admissions browser fixture retained usable sessions or grants.");
}
